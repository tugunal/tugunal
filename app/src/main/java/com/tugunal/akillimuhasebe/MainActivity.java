package com.tugunal.akillimuhasebe;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.graphics.Color;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.view.Window;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;

public class MainActivity extends Activity {
    private static final String PREFS = "akilli_muhasebe_secure";
    private static final String KEY_ALIAS = "akilli_muhasebe_local_data_key";
    private static final int FILE_PICKER_REQUEST = 4107;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private long pausedAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(11, 24, 48));
        window.setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(true);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 248, 252));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setDatabaseEnabled(true);

        webView.addJavascriptInterface(new SecureBridge(), "NativeStore");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("if(window.bootstrap){window.bootstrap();}", null);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, FILE_PICKER_REQUEST);
                    return true;
                } catch (Exception ex) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Dosya seçici açılamadı.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        pausedAt = System.currentTimeMillis();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null && pausedAt > 0L
                && System.currentTimeMillis() - pausedAt > 30000L) {
            webView.postDelayed(() ->
                    webView.evaluateJavascript("if(window.lockApp){window.lockApp();}", null), 250);
        }
        pausedAt = 0L;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST && filePathCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(window.handleBack){window.handleBack();}else{history.back();}", null);
        } else {
            super.onBackPressed();
        }
    }

    private SecretKey getOrCreateEncryptionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build();
        generator.init(spec);
        return generator.generateKey();
    }

    private String encrypt(String plainText) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEncryptionKey());
        byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        byte[] combined = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
        return Base64.getEncoder().encodeToString(combined);
    }

    private String decrypt(String encoded) throws Exception {
        byte[] combined = Base64.getDecoder().decode(encoded);
        if (combined.length < 13) return "{}";
        byte[] iv = new byte[12];
        byte[] encrypted = new byte[combined.length - 12];
        System.arraycopy(combined, 0, iv, 0, 12);
        System.arraycopy(combined, 12, encrypted, 0, encrypted.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateEncryptionKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private byte[] derivePinHash(String pin, byte[] salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, 120000, 256);
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return factory.generateSecret(spec).getEncoded();
        } finally {
            spec.clearPassword();
        }
    }

    private void saveBackupFile(String json) {
        String fileName = "AkilliMuhasebe_Yedek_" + System.currentTimeMillis() + ".json";
        try {
            OutputStream outputStream;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/AkilliMuhasebe");
                Uri uri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Dosya oluşturulamadı");
                outputStream = getContentResolver().openOutputStream(uri);
            } else {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        "AkilliMuhasebe");
                if (!dir.exists()) dir.mkdirs();
                outputStream = new FileOutputStream(new File(dir, fileName));
            }
            if (outputStream == null) throw new IllegalStateException("Dosya açılamadı");
            outputStream.write(json.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.close();
            runOnUiThread(() -> Toast.makeText(this,
                    "Yedek Dosyalar/AkilliMuhasebe klasörüne kaydedildi.",
                    Toast.LENGTH_LONG).show());
        } catch (Exception ex) {
            runOnUiThread(() -> Toast.makeText(this,
                    "Yedek kaydedilemedi: " + ex.getMessage(),
                    Toast.LENGTH_LONG).show());
        }
    }

    public class SecureBridge {
        @JavascriptInterface
        public String hasPin() {
            return getSharedPreferences(PREFS, MODE_PRIVATE).contains("pin_hash") ? "true" : "false";
        }

        @JavascriptInterface
        public String setPin(String pin) {
            try {
                if (pin == null || pin.length() < 6 || pin.length() > 32) return "invalid";
                byte[] salt = new byte[16];
                new SecureRandom().nextBytes(salt);
                byte[] hash = derivePinHash(pin, salt);
                SharedPreferences.Editor editor = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
                editor.putString("pin_salt", Base64.getEncoder().encodeToString(salt));
                editor.putString("pin_hash", Base64.getEncoder().encodeToString(hash));
                editor.apply();
                return "ok";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String verifyPin(String pin) {
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                String saltText = prefs.getString("pin_salt", "");
                String hashText = prefs.getString("pin_hash", "");
                if (saltText.isEmpty() || hashText.isEmpty() || pin == null) return "false";
                byte[] salt = Base64.getDecoder().decode(saltText);
                byte[] expected = Base64.getDecoder().decode(hashText);
                byte[] actual = derivePinHash(pin, salt);
                return MessageDigest.isEqual(expected, actual) ? "true" : "false";
            } catch (Exception ex) {
                return "false";
            }
        }

        @JavascriptInterface
        public String loadData() {
            String encrypted = getSharedPreferences(PREFS, MODE_PRIVATE).getString("encrypted_db", "");
            if (encrypted.isEmpty()) return "{}";
            try {
                return decrypt(encrypted);
            } catch (Exception ex) {
                return "{}";
            }
        }

        @JavascriptInterface
        public String saveData(String json) {
            try {
                String encrypted = encrypt(json == null ? "{}" : json);
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString("encrypted_db", encrypted).apply();
                return "ok";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public void saveBackup(String json) {
            saveBackupFile(json == null ? "{}" : json);
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ex) {
                return "0.1.0";
            }
        }

        @JavascriptInterface
        public void showMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    message == null ? "" : message, Toast.LENGTH_SHORT).show());
        }
    }
}
