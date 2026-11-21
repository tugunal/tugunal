package com.tugunal.akillimuhasebe;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.view.Window;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.EditText;
import android.text.InputType;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import org.json.JSONObject;
import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.BufferedInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
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
import javax.crypto.spec.SecretKeySpec;

import com.google.mlkit.vision.common.InputImage;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

public class MainActivity extends Activity {
    private static final String CANONICAL_PACKAGE_ID = "com.tugunal.akillimuhasebe.stable";
    private static final String PREFS = "akilli_muhasebe_secure";
    private static final String LOCAL_ACCOUNTS_KEY = "encrypted_auth_accounts_v1";
    private volatile String activeLocalUsername = "";
    // New account credentials stay reversible until the encrypted profile is saved.
    private volatile String pendingLocalRegistrationUsername = "";
    private volatile int failedAccountAttempts = 0;
    private volatile long accountLockUntil = 0L;

    private static final String KEY_ALIAS = "akilli_muhasebe_local_data_key";
    private static final int FILE_PICKER_REQUEST = 4107;
    private static final int EMBEDDED_CAMERA_REQUEST = 4108;
    private static final int BACKUP_ITERATIONS = 150000;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private long pausedAt = 0L;
    private File pendingInstallFile;
    private boolean embeddedCameraActive = false;
    private volatile boolean dataReadFailed = false;
    private volatile boolean nativeUnlocked = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(11, 24, 48));
        window.setNavigationBarColor(Color.WHITE);
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(true);

        WebView.setWebContentsDebuggingEnabled(false);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 248, 252));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.addJavascriptInterface(new SecureBridge(), "NativeStore");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return !url.startsWith("file:///android_asset/") && !url.equals("about:blank");
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/") && !url.equals("about:blank");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("if(window.bootstrap){window.bootstrap();}", null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] acceptTypes = params.getAcceptTypes();
                boolean imageRequest = false, pdfRequest = false, bankRequest = false, xmlRequest = false;
                if (acceptTypes != null) {
                    for (String acceptType : acceptTypes) {
                        if (acceptType == null) continue;
                        String accept = acceptType.toLowerCase(Locale.ROOT);
                        if (accept.contains("image")) imageRequest = true;
                        if (accept.contains("pdf")) pdfRequest = true;
                        if (accept.contains("xml")) xmlRequest = true;
                        if (accept.contains("csv") || accept.contains("spreadsheet")
                                || accept.contains("excel") || accept.contains("xlsx")
                                || accept.contains(".txt")) bankRequest = true;
                    }
                }
                if (imageRequest && !pdfRequest && !bankRequest && !xmlRequest) {
                    intent.setType("image/*");
                } else if (pdfRequest && !bankRequest && !xmlRequest) {
                    intent.setType("application/pdf");
                } else if (xmlRequest && !bankRequest) {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                            "application/xml", "text/xml", "application/octet-stream"
                    });
                } else if (bankRequest) {
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                            "text/csv", "text/plain",
                            "application/csv", "application/vnd.ms-excel",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            "application/octet-stream"
                    });
                } else {
                    intent.setType("application/json");
                }
                try {
                    startActivityForResult(intent, FILE_PICKER_REQUEST);
                    return true;
                } catch (Exception ex) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Dosya seçici açılamadı.", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("Tamam", (dialog, which) -> result.confirm())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("Evet", (dialog, which) -> result.confirm())
                        .setNegativeButton("Vazgeç", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this);
                input.setSingleLine(true);
                input.setInputType(InputType.TYPE_CLASS_TEXT
                        | InputType.TYPE_TEXT_VARIATION_PASSWORD);
                input.setText(defaultValue == null ? "" : defaultValue);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Güvenli yedekleme")
                        .setMessage(message)
                        .setView(input)
                        .setPositiveButton("Devam et",
                                (dialog, which) -> result.confirm(input.getText().toString()))
                        .setNegativeButton("İptal", (dialog, which) -> result.cancel())
                        .setOnCancelListener(dialog -> result.cancel())
                        .show();
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        // Leaving the main screen for our own camera is not leaving the app.
        pausedAt = embeddedCameraActive ? 0L : System.currentTimeMillis();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null && !embeddedCameraActive && pausedAt > 0L
                && System.currentTimeMillis() - pausedAt > 30000L) {
            nativeUnlocked = false;
            webView.postDelayed(() ->
                    webView.evaluateJavascript("if(window.lockApp){window.lockApp();}", null), 250);
        }
        pausedAt = 0L;
        if (pendingInstallFile != null && Build.VERSION.SDK_INT >= 26
                && getPackageManager().canRequestPackageInstalls()) {
            File file = pendingInstallFile;
            pendingInstallFile = null;
            webView.postDelayed(() -> openApkInstaller(file), 350);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == EMBEDDED_CAMERA_REQUEST) {
            embeddedCameraActive = false;
            pausedAt = 0L;
            if (resultCode == RESULT_OK && data != null
                    && data.hasExtra(CameraCaptureActivity.EXTRA_CAPTURED_PATH)) {
                String filepath = data.getStringExtra(CameraCaptureActivity.EXTRA_CAPTURED_PATH);
                sendEmbeddedCameraStatus("Fotoğraf onaylandı. Belge metni okunuyor.", true);
                new Thread(() -> recognizeCapturedPhoto(filepath)).start();
            } else {
                sendEmbeddedCameraStatus("Kamera kapatıldı. Fotoğraf kaydedilmedi.", false);
            }
            return;
        }
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

    private String encryptLocalData(String plainText) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateEncryptionKey());
        byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        byte[] combined = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
        return Base64.getEncoder().encodeToString(combined);
    }

    private String decryptLocalData(String encoded) throws Exception {
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

    /** Credentials are encrypted with the Android Keystore, with per-account salted PBKDF2 hashes. */
    private JSONArray readLocalAccounts() throws Exception {
        String encrypted = getSharedPreferences(PREFS, MODE_PRIVATE).getString(LOCAL_ACCOUNTS_KEY, "");
        return encrypted.isEmpty() ? new JSONArray() : new JSONArray(decryptLocalData(encrypted));
    }

    private static String normalizeAccountName(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizePhoneNumber(String phone) {
        if (phone == null || phone.trim().isEmpty()) return "";
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("0090") && digits.length() == 14) digits = digits.substring(4);
        if (digits.startsWith("90") && digits.length() == 12) digits = digits.substring(2);
        if (digits.startsWith("0") && digits.length() == 11) digits = digits.substring(1);
        return digits;
    }

    private static boolean isAccountNameValid(String name) {
        return name != null && name.matches("[a-zA-Z0-9._-]{3,30}");
    }

    private static boolean isEmailValid(String email) {
        return email != null && email.length() <= 120 &&
                email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    }

    private static boolean isPhoneValid(String normalizedPhone) {
        return normalizedPhone == null || normalizedPhone.isEmpty() ||
                normalizedPhone.matches("[0-9]{10,15}");
    }

    private int findLocalAccountIndex(JSONArray accounts, String identifier) {
        String key = normalizeAccountName(identifier);
        String phoneKey = normalizePhoneNumber(identifier);
        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i);
            if (account == null) continue;
            if (key.equals(account.optString("username", "")) ||
                    key.equals(account.optString("email", "")) ||
                    (!phoneKey.isEmpty() && phoneKey.equals(account.optString("phone", "")))) {
                return i;
            }
        }
        return -1;
    }

    private boolean storeLocalAccounts(JSONArray accounts) throws Exception {
        String encrypted = encryptLocalData(accounts.toString());
        return getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(LOCAL_ACCOUNTS_KEY, encrypted).commit();
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

    private SecretKey deriveBackupKey(String password, byte[] salt, int iterations) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, 256);
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            byte[] keyBytes = factory.generateSecret(spec).getEncoded();
            return new SecretKeySpec(keyBytes, "AES");
        } finally {
            spec.clearPassword();
        }
    }

    private String encryptBackup(String json, String password) throws Exception {
        if (password == null || password.length() < 8) throw new IllegalArgumentException("weak password");
        SecureRandom random = new SecureRandom();
        byte[] salt = new byte[16];
        byte[] iv = new byte[12];
        random.nextBytes(salt);
        random.nextBytes(iv);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,
                deriveBackupKey(password, salt, BACKUP_ITERATIONS),
                new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(json.getBytes(StandardCharsets.UTF_8));

        JSONObject envelope = new JSONObject();
        envelope.put("format", "AKILLI_MUHASEBE_BACKUP_V1");
        envelope.put("iterations", BACKUP_ITERATIONS);
        envelope.put("salt", Base64.getEncoder().encodeToString(salt));
        envelope.put("iv", Base64.getEncoder().encodeToString(iv));
        envelope.put("data", Base64.getEncoder().encodeToString(encrypted));
        return envelope.toString(2);
    }

    private String decryptBackupEnvelope(String envelopeText, String password) throws Exception {
        JSONObject envelope = new JSONObject(envelopeText);
        if (!"AKILLI_MUHASEBE_BACKUP_V1".equals(envelope.optString("format"))) {
            throw new IllegalArgumentException("invalid backup format");
        }
        int iterations = envelope.optInt("iterations", BACKUP_ITERATIONS);
        if (iterations < 100000 || iterations > 1000000) {
            throw new IllegalArgumentException("invalid iteration count");
        }
        byte[] salt = Base64.getDecoder().decode(envelope.getString("salt"));
        byte[] iv = Base64.getDecoder().decode(envelope.getString("iv"));
        byte[] encrypted = Base64.getDecoder().decode(envelope.getString("data"));

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,
                deriveBackupKey(password, salt, iterations),
                new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    private boolean saveExportFile(String fileName, String mimeType, String contents) {
        try {
            if (contents == null || contents.getBytes(StandardCharsets.UTF_8).length > 8_000_000)
                throw new IllegalArgumentException("Dosya 8 MB sınırını aşıyor.");
            if (fileName == null || !fileName.matches("[A-Za-z0-9_-]{1,72}\\.csv"))
                throw new IllegalArgumentException("Geçersiz dosya adı.");
            OutputStream outputStream;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "text/csv");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/AkilliMuhasebe");
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("Dışa aktarma dosyası oluşturulamadı.");
                outputStream = getContentResolver().openOutputStream(uri);
            } else {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "AkilliMuhasebe");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Klasör oluşturulamadı.");
                outputStream = new FileOutputStream(new File(dir, fileName));
            }
            if (outputStream == null) throw new IllegalStateException("Dışa aktarma dosyası açılamadı.");
            try (OutputStream out = outputStream) {
                out.write(contents.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            runOnUiThread(() -> Toast.makeText(this,
                    "CSV, İndirilenler/AkilliMuhasebe klasörüne kaydedildi.",
                    Toast.LENGTH_LONG).show());
            return true;
        } catch (Exception ex) {
            runOnUiThread(() -> Toast.makeText(this,
                    "CSV dışa aktarımı başarısız: " + ex.getMessage(), Toast.LENGTH_LONG).show());
            return false;
        }
    }

    private boolean saveBackupFile(String encryptedEnvelope) {
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
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Klasör oluşturulamadı");
                outputStream = new FileOutputStream(new File(dir, fileName));
            }
            if (outputStream == null) throw new IllegalStateException("Dosya açılamadı");
            outputStream.write(encryptedEnvelope.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.close();
            runOnUiThread(() -> Toast.makeText(this,
                    "Şifreli yedek İndirilenler/AkilliMuhasebe klasörüne kaydedildi.",
                    Toast.LENGTH_LONG).show());
            return true;
        } catch (Exception ex) {
            runOnUiThread(() -> Toast.makeText(this,
                    "Yedek kaydedilemedi: " + ex.getMessage(),
                    Toast.LENGTH_LONG).show());
            return false;
        }
    }

    private void sendEmbeddedCameraStatus(String message, boolean accepted) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("message", message);
            payload.put("accepted", accepted);
        } catch (Exception ignored) { }
        String argument = payload.toString();
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.onEmbeddedCameraStatus && window.onEmbeddedCameraStatus("
                        + argument + ");", null);
            }
        });
    }

    private void recognizeCapturedPhoto(String path) {
        File file = null;
        TextRecognizer recognizer = null;
        try {
            if (path == null || path.isEmpty()) {
                throw new IllegalArgumentException("Fotoğraf yolu bulunamadı.");
            }
            file = new File(path).getCanonicalFile();
            File cache = getCacheDir().getCanonicalFile();
            if (!cache.equals(file.getParentFile()) ||
                    !file.getName().startsWith("document_capture_") ||
                    !file.getName().endsWith(".jpg")) {
                throw new SecurityException("Güvenilmeyen fotoğraf konumu.");
            }
            if (!file.exists() || file.length() < 512 || file.length() > 20L * 1024 * 1024) {
                throw new IllegalArgumentException("Fotoğraf boş veya çok büyük.");
            }
            final File captured = file;
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            final TextRecognizer activeRecognizer = recognizer;
            InputImage input = InputImage.fromFilePath(this, Uri.fromFile(captured));
            activeRecognizer.process(input)
                    .addOnSuccessListener(result ->
                            sendInvoiceOcrResult(true, result.getText(), "", result))
                    .addOnFailureListener(error ->
                            sendInvoiceOcrResult(false, "", "Fotoğrafın yazıları okunamadı. Yeniden çekmeyi deneyin."))
                    .addOnCompleteListener(task -> {
                        activeRecognizer.close();
                        if (captured.exists()) captured.delete();
                    });
        } catch (Exception error) {
            if (recognizer != null) recognizer.close();
            if (file != null && file.exists()) file.delete();
            sendInvoiceOcrResult(false, "", "Fotoğraf işlenemedi: " + error.getMessage());
        }
    }

    private void sendInvoiceOcrResult(boolean success, String text, String error) {
        sendInvoiceOcrResult(success, text, error, null);
    }

    private JSONArray positionedOcrLines(Text recognitionResult) {
        JSONArray lines = new JSONArray();
        if (recognitionResult == null) return lines;
        for (Text.TextBlock block : recognitionResult.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                if (lines.length() >= 600) break;
                Rect bounds = line.getBoundingBox();
                if (bounds == null || line.getText() == null) continue;
                JSONObject data = new JSONObject();
                try {
                    data.put("text", line.getText());
                    data.put("x", bounds.left);
                    data.put("y", bounds.top);
                    data.put("width", bounds.width());
                    data.put("height", bounds.height());
                    lines.put(data);
                } catch (Exception ignored) { }
            }
        }
        return lines;
    }

    private void sendInvoiceOcrResult(boolean success, String text, String error,
                                      Text recognitionResult) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("success", success);
            payload.put("text", text == null ? "" : text);
            payload.put("error", error == null ? "" : error);
            payload.put("lines", positionedOcrLines(recognitionResult));
            String argument = payload.toString();
            runOnUiThread(() -> {
                if (webView != null) {
                    webView.evaluateJavascript(
                            "window.onInvoiceOcrResult && window.onInvoiceOcrResult(" + argument + ");",
                            null);
                }
            });
        } catch (Exception ignored) {
            runOnUiThread(() -> Toast.makeText(this,
                    "Fatura metni uygulamaya aktarılamadı.", Toast.LENGTH_SHORT).show());
        }
    }

    private Bitmap decodeInvoiceBitmap(byte[] bytes) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int sample = 1;
        int maxDimension = Math.max(bounds.outWidth, bounds.outHeight);
        while (maxDimension / sample > 2200) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    private void sendUpdateCallback(String callback, JSONObject payload) {
        String argument = payload.toString();
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window." + callback + " && window." + callback
                        + "(" + argument + ");", null);
            }
        });
    }

    private int compareVersions(String left, String right) {
        String[] a = left.replaceFirst("^[vV]", "").split("[.-]");
        String[] b = right.replaceFirst("^[vV]", "").split("[.-]");
        int length = Math.max(a.length, b.length);
        for (int i = 0; i < length; i++) {
            int av = i < a.length ? parseVersionPart(a[i]) : 0;
            int bv = i < b.length ? parseVersionPart(b[i]) : 0;
            if (av != bv) return Integer.compare(av, bv);
        }
        return 0;
    }

    private int parseVersionPart(String value) {
        try { return Integer.parseInt(value.replaceAll("[^0-9].*$", "")); }
        catch (Exception ex) { return 0; }
    }

    private void checkForLatestRelease(String currentVersion) {
        HttpURLConnection connection = null;
        try {
            if (!CANONICAL_PACKAGE_ID.equals(getPackageName())) {
                throw new IllegalStateException("Bu test kurulumu resmî uygulamanın güncellemesi değildir. Önce şifreli yedek alın; resmî tek uygulamayı kurun.");
            }
            URL url = new URL("https://api.github.com/repos/tugunal/tugunal/releases/latest");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
            connection.setRequestProperty("User-Agent", "AkilliMuhasebe-Android");
            int code = connection.getResponseCode();
            if (code != 200) throw new IllegalStateException(
                    code == 404 ? "Henüz yayınlanmış bir güncelleme bulunmuyor." :
                            "Güncelleme sunucusu HTTP " + code + " yanıtı verdi.");
            StringBuilder body = new StringBuilder();
            try (InputStream input = new BufferedInputStream(connection.getInputStream())) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    body.append(new String(buffer, 0, count, StandardCharsets.UTF_8));
                    if (body.length() > 2_000_000) throw new IllegalStateException("Güncelleme bilgisi çok büyük.");
                }
            }
            JSONObject release = new JSONObject(body.toString());
            String tag = release.optString("tag_name", "").trim();
            String latestVersion = tag.replaceFirst("^[vV]", "");
            if (latestVersion.isEmpty()) throw new IllegalStateException("Sürüm numarası bulunamadı.");
            if (release.optBoolean("draft", false) || release.optBoolean("prerelease", false)) {
                throw new IllegalStateException("Yayınlanan kararlı sürüm bulunamadı.");
            }
            org.json.JSONArray assets = release.optJSONArray("assets");
            String downloadUrl = "";
            String digest = "";
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    if (asset == null) continue;
                    String name = asset.optString("name", "");
                    // Exact asset name: other build flavors must NEVER be installed.
                    if (name.equals("AkilliMuhasebe-v" + latestVersion + ".apk")) {
                        downloadUrl = asset.optString("browser_download_url", "");
                        digest = asset.optString("digest", "");
                        break;
                    }
                }
            }
            if (downloadUrl.isEmpty()) throw new IllegalStateException("Yayın içinde APK dosyası bulunamadı.");
            JSONObject result = new JSONObject();
            result.put("success", true);
            result.put("currentVersion", currentVersion == null ? "" : currentVersion);
            result.put("latestVersion", latestVersion);
            result.put("downloadUrl", downloadUrl);
            result.put("digest", digest);
            result.put("releaseNotes", release.optString("body", ""));
            sendUpdateCallback("onUpdateCheckResult", result);
        } catch (Exception ex) {
            JSONObject result = new JSONObject();
            try {
                result.put("success", false);
                result.put("error", ex.getMessage() == null ? "Güncelleme kontrolü başarısız." : ex.getMessage());
                result.put("currentVersion", currentVersion == null ? "" : currentVersion);
            } catch (Exception ignored) { }
            sendUpdateCallback("onUpdateCheckResult", result);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void sendUpdateProgress(int percent, long received, long total) {
        JSONObject result = new JSONObject();
        try {
            result.put("percent", percent);
            result.put("received", received);
            result.put("total", total);
        } catch (Exception ignored) { }
        sendUpdateCallback("onUpdateDownloadProgress", result);
    }

    private void sendUpdateDownloadResult(boolean success, String message) {
        JSONObject result = new JSONObject();
        try {
            result.put("success", success);
            result.put("message", message == null ? "" : message);
        } catch (Exception ignored) { }
        sendUpdateCallback("onUpdateDownloadResult", result);
    }

    private void downloadUpdateApk(String downloadUrl, String expectedDigest) {
        HttpURLConnection connection = null;
        File target = null;
        try {
            if (!CANONICAL_PACKAGE_ID.equals(getPackageName())) {
                throw new SecurityException("Eski test paketinden otomatik güncelleme yapılamaz.");
            }
            URL url = new URL(downloadUrl);
            String path = url.getPath();
            if (!"https".equalsIgnoreCase(url.getProtocol())
                    || !"github.com".equalsIgnoreCase(url.getHost())
                    || !path.matches("^/tugunal/tugunal/releases/download/v[0-9]+[.][0-9]+[.][0-9]+/AkilliMuhasebe-v[0-9]+[.][0-9]+[.][0-9]+[.]apk$")) {
                throw new IllegalArgumentException("Güvenilmeyen veya farklı paketli güncelleme adresi.");
            }
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "AkilliMuhasebe-Android");
            int response = connection.getResponseCode();
            if (response != 200) throw new IllegalStateException("APK indirme sunucusu HTTP " + response + " yanıtı verdi.");
            long total = connection.getContentLengthLong();
            File folder = new File(getCacheDir(), "updates");
            if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Güncelleme klasörü oluşturulamadı.");
            target = new File(folder, "AkilliMuhasebe-update.apk");
            if (target.exists() && !target.delete()) throw new IllegalStateException("Eski indirme dosyası temizlenemedi.");
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            long received = 0;
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[65536];
                int count;
                int lastPercent = -1;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    sha.update(buffer, 0, count);
                    received += count;
                    int percent = total > 0 ? (int) Math.min(100, (received * 100L) / total) : 0;
                    if (percent != lastPercent && (percent == 100 || percent % 5 == 0)) {
                        sendUpdateProgress(percent, received, total);
                        lastPercent = percent;
                    }
                }
                output.flush();
            }
            if (received < 1_000_000L) throw new IllegalStateException("İndirilen APK dosyası beklenenden küçük.");
            String actualDigest = toHex(sha.digest());
            if (expectedDigest != null && expectedDigest.startsWith("sha256:")
                    && !actualDigest.equalsIgnoreCase(expectedDigest.substring(7))) {
                target.delete();
                throw new SecurityException("APK doğrulaması başarısız. Dosya güvenlik kontrolünden geçmedi.");
            }
            verifyUpdateApkIdentity(target);
            File ready = target;
            runOnUiThread(() -> {
                sendUpdateDownloadResult(true, "APK indirildi. Android kurulum ekranı açılıyor.");
                requestApkInstall(ready);
            });
        } catch (Exception ex) {
            if (target != null && target.exists()) target.delete();
            sendUpdateDownloadResult(false, ex.getMessage() == null ? "APK indirilemedi." : ex.getMessage());
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * An update MUST match the installed package name and signing certificate.
     * Rejects sideload/test APKs before opening Android's installer.
     */
    private void verifyUpdateApkIdentity(File apk) throws Exception {
        int flags = Build.VERSION.SDK_INT >= 28
                ? android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES
                : android.content.pm.PackageManager.GET_SIGNATURES;
        android.content.pm.PackageInfo archive =
                getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null || !CANONICAL_PACKAGE_ID.equals(archive.packageName)
                || !getPackageName().equals(archive.packageName)) {
            throw new SecurityException("Paket kimliği uyuşmuyor. Yeni uygulama kurulması engellendi.");
        }
        android.content.pm.PackageInfo installed = getPackageManager().getPackageInfo(getPackageName(), flags);
        android.content.pm.Signature[] appSignatures;
        android.content.pm.Signature[] archiveSignatures;
        if (Build.VERSION.SDK_INT >= 28) {
            if (installed.signingInfo == null || archive.signingInfo == null) {
                throw new SecurityException("Güncellemenin imzası okunamadı.");
            }
            appSignatures = installed.signingInfo.getApkContentsSigners();
            archiveSignatures = archive.signingInfo.getApkContentsSigners();
        } else {
            appSignatures = installed.signatures;
            archiveSignatures = archive.signatures;
        }
        if (appSignatures == null || archiveSignatures == null || appSignatures.length != 1
                || archiveSignatures.length != 1 || !appSignatures[0].equals(archiveSignatures[0])) {
            throw new SecurityException("İmza uyuşmazlığı. Mevcut uygulama korunuyor.");
        }
        long oldCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        long newCode = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        if (newCode <= oldCode) {
            throw new IllegalStateException("Aynı veya daha eski sürüm yüklenemez.");
        }
    }

    private String toHex(byte[] bytes) {
        StringBuilder value = new StringBuilder();
        for (byte b : bytes) value.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return value.toString();
    }

    private void requestApkInstall(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingInstallFile = apk;
            Toast.makeText(this, "APK kurulumu için bu uygulamaya izin verin.", Toast.LENGTH_LONG).show();
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(settings);
            return;
        }
        openApkInstaller(apk);
    }

    private void openApkInstaller(File apk) {
        try {
            Uri contentUri = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(contentUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (Exception ex) {
            Toast.makeText(this, "Android kurulum ekranı açılamadı: " + ex.getMessage(),
                    Toast.LENGTH_LONG).show();
        }
    }

    private void recognizeInvoicePdfBytes(String base64) {
        File temp = null;
        TextRecognizer recognizer = null;
        try {
            if (base64 == null || base64.length() > 14000000) {
                throw new IllegalArgumentException("PDF 10 MB sınırını aşıyor.");
            }
            byte[] bytes = Base64.getDecoder().decode(base64);
            if (bytes.length == 0 || bytes.length > 10 * 1024 * 1024) {
                throw new IllegalArgumentException("PDF boş veya 10 MB sınırından büyük.");
            }
            temp = File.createTempFile("invoice-", ".pdf", getCacheDir());
            try (FileOutputStream output = new FileOutputStream(temp)) {
                output.write(bytes);
            }
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            StringBuilder allText = new StringBuilder();
            try (ParcelFileDescriptor descriptor =
                         ParcelFileDescriptor.open(temp, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer renderer = new PdfRenderer(descriptor)) {
                int totalPages = renderer.getPageCount();
                if (totalPages == 0) throw new IllegalStateException("PDF sayfası bulunamadı.");
                for (int i = 0; i < Math.min(totalPages, 3); i++) {
                    PdfRenderer.Page page = renderer.openPage(i);
                    Bitmap bitmap = null;
                    try {
                        int width = page.getWidth();
                        int height = page.getHeight();
                        if (width <= 0 || height <= 0) continue;
                        double factor = Math.min(2.5, Math.min(2100.0 / width, 2800.0 / height));
                        int renderWidth = Math.max(1, (int) (width * factor));
                        int renderHeight = Math.max(1, (int) (height * factor));
                        bitmap = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888);
                        bitmap.eraseColor(Color.WHITE);
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        String found = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).getText();
                        allText.append(found == null ? "" : found).append("\n");
                    } finally {
                        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
                        page.close();
                    }
                }
                if (totalPages > 3) allText.append("\n[İlk 3 sayfa okundu]");
            }
            sendInvoiceOcrResult(true, allText.toString(), "");
        } catch (Exception e) {
            String message = e.getMessage() == null ? "PDF okunamadı." : e.getMessage();
            sendInvoiceOcrResult(false, "", message);
        } finally {
            if (recognizer != null) recognizer.close();
            if (temp != null && temp.exists()) temp.delete();
        }
    }

    private void parseBankFileBytes(String base64, String filename) {
        try {
            JSONObject parsed = BankFileParser.parse(base64, filename);
            sendUpdateCallback("onBankFileResult", parsed);
        } catch (Exception ex) {
            JSONObject result = new JSONObject();
            try {
                result.put("success", false);
                result.put("error", ex.getMessage() == null ? "Ekstre açılamadı." : ex.getMessage());
            } catch (Exception ignored) { }
            sendUpdateCallback("onBankFileResult", result);
        }
    }

    public class SecureBridge {
        @JavascriptInterface
        public String hasLocalAccounts() {
            try { return readLocalAccounts().length() > 0 ? "true" : "false"; }
            catch (Exception ex) { return "error"; }
        }

        @JavascriptInterface
        public String currentLocalUser() {
            return nativeUnlocked ? activeLocalUsername : "";
        }

        /** Requires an unlocked device during registration. Passwords are never stored in the JavaScript database. */
        @JavascriptInterface
        public String registerLocalAccount(String username, String email, String phone, String password) {
            if (!nativeUnlocked) return "locked";
            String u = normalizeAccountName(username);
            String e = normalizeAccountName(email);
            String normalizedPhone = normalizePhoneNumber(phone);
            if (!isAccountNameValid(u) || !isEmailValid(e) || !isPhoneValid(normalizedPhone) ||
                    password == null || password.length() < 8 || password.length() > 64) return "invalid";
            try {
                JSONArray accounts = readLocalAccounts();
                if (findLocalAccountIndex(accounts, u) >= 0 ||
                        findLocalAccountIndex(accounts, e) >= 0 ||
                        (!normalizedPhone.isEmpty() && findLocalAccountIndex(accounts, normalizedPhone) >= 0))
                    return "duplicate";
                byte[] salt = new byte[16];
                new SecureRandom().nextBytes(salt);
                JSONObject account = new JSONObject();
                account.put("username", u);
                account.put("email", e);
                account.put("phone", normalizedPhone);
                account.put("salt", Base64.getEncoder().encodeToString(salt));
                account.put("hash", Base64.getEncoder().encodeToString(derivePinHash(password, salt)));
                accounts.put(account);
                if (!storeLocalAccounts(accounts)) return "error";
                activeLocalUsername = u;
                pendingLocalRegistrationUsername = u;
                return "ok";
            } catch (Exception ex) {
                return "error";
            }
        }

        /**
         * Remove ONLY the just-created credential when the matching encrypted profile
         * could not be saved. A successful saveData call clears the pending marker.
         */
        @JavascriptInterface
        public String rollbackLocalRegistration(String username) {
            String u = normalizeAccountName(username);
            if (!nativeUnlocked || !u.equals(activeLocalUsername)
                    || !u.equals(pendingLocalRegistrationUsername)) return "locked";
            try {
                JSONArray accounts = readLocalAccounts();
                int index = findLocalAccountIndex(accounts, u);
                if (index < 0) return "not_found";
                JSONArray remaining = new JSONArray();
                for (int i = 0; i < accounts.length(); i++) {
                    if (i != index) remaining.put(accounts.get(i));
                }
                if (!storeLocalAccounts(remaining)) return "error";
                pendingLocalRegistrationUsername = "";
                activeLocalUsername = "";
                nativeUnlocked = false;
                return "ok";
            } catch (Exception ex) {
                return "error";
            }
        }

        /** Verify username OR email OR phone together with this user's own password. */
        @JavascriptInterface
        public String authenticateLocalAccount(String identifier, String password) {
            nativeUnlocked = false;
            activeLocalUsername = "";
            if (System.currentTimeMillis() < accountLockUntil) return "rate_limited";
            if (identifier == null || identifier.length() > 140 || password == null ||
                    password.length() > 64) return "invalid";
            try {
                JSONArray accounts = readLocalAccounts();
                if (accounts.length() == 0) return "no_accounts";
                int idx = findLocalAccountIndex(accounts, identifier);
                if (idx < 0) return recordFailedAccountLogin();
                JSONObject account = accounts.optJSONObject(idx);
                if (account == null) return recordFailedAccountLogin();
                byte[] salt = Base64.getDecoder().decode(account.getString("salt"));
                byte[] expected = Base64.getDecoder().decode(account.getString("hash"));
                if (!MessageDigest.isEqual(expected, derivePinHash(password, salt)))
                    return recordFailedAccountLogin();
                failedAccountAttempts = 0;
                accountLockUntil = 0L;
                activeLocalUsername = account.optString("username", "");
                nativeUnlocked = true;
                return "ok";
            } catch (Exception ex) {
                return "error";
            }
        }

        private String recordFailedAccountLogin() {
            failedAccountAttempts++;
            if (failedAccountAttempts >= 5) {
                accountLockUntil = System.currentTimeMillis() + 30000L;
                failedAccountAttempts = 0;
                return "rate_limited";
            }
            return "invalid";
        }

        @JavascriptInterface
        public String changeLocalAccountPassword(String oldPassword, String newPassword) {
            if (!nativeUnlocked || activeLocalUsername.isEmpty() || oldPassword == null ||
                    newPassword == null || newPassword.length() < 8 || newPassword.length() > 64)
                return "invalid";
            try {
                JSONArray accounts = readLocalAccounts();
                int idx = findLocalAccountIndex(accounts, activeLocalUsername);
                if (idx < 0) return "not_found";
                JSONObject account = accounts.getJSONObject(idx);
                byte[] salt = Base64.getDecoder().decode(account.getString("salt"));
                byte[] currentHash = Base64.getDecoder().decode(account.getString("hash"));
                if (!MessageDigest.isEqual(currentHash, derivePinHash(oldPassword, salt)))
                    return "invalid_old";
                byte[] newSalt = new byte[16];
                new SecureRandom().nextBytes(newSalt);
                account.put("salt", Base64.getEncoder().encodeToString(newSalt));
                account.put("hash", Base64.getEncoder().encodeToString(derivePinHash(newPassword, newSalt)));
                return storeLocalAccounts(accounts) ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        /** Keeps phone/e-mail identifiers synchronized with profile edits. */
        @JavascriptInterface
        public String updateLocalAccountContact(String username, String email, String phone) {
            if (!nativeUnlocked || !normalizeAccountName(username).equals(activeLocalUsername))
                return "locked";
            String e = normalizeAccountName(email);
            String normalizedPhone = normalizePhoneNumber(phone);
            if (!isEmailValid(e) || !isPhoneValid(normalizedPhone)) return "invalid";
            try {
                JSONArray accounts = readLocalAccounts();
                int idx = findLocalAccountIndex(accounts, activeLocalUsername);
                if (idx < 0) return "not_found";
                for (int i = 0; i < accounts.length(); i++) {
                    if (i == idx) continue;
                    JSONObject other = accounts.optJSONObject(i);
                    if (other == null) continue;
                    if (e.equals(other.optString("email", "")) ||
                        e.equals(other.optString("username", "")) ||
                        (!normalizedPhone.isEmpty() && normalizedPhone.equals(other.optString("phone", ""))))
                        return "duplicate";
                }
                JSONObject account = accounts.getJSONObject(idx);
                account.put("email", e);
                account.put("phone", normalizedPhone);
                return storeLocalAccounts(accounts) ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String hasPin() {
            return getSharedPreferences(PREFS, MODE_PRIVATE).contains("pin_hash") ? "true" : "false";
        }

        @JavascriptInterface
        public String setPin(String pin) {
            try {
                if (pin == null || pin.length() < 6 || pin.length() > 64) return "invalid";
                if (getSharedPreferences(PREFS, MODE_PRIVATE).contains("pin_hash")) return "already_set";
                byte[] salt = new byte[16];
                new SecureRandom().nextBytes(salt);
                byte[] hash = derivePinHash(pin, salt);
                SharedPreferences.Editor editor = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
                editor.putString("pin_salt", Base64.getEncoder().encodeToString(salt));
                editor.putString("pin_hash", Base64.getEncoder().encodeToString(hash));
                if (!editor.commit()) return "error";
                nativeUnlocked = true;
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
                nativeUnlocked = MessageDigest.isEqual(expected, actual);
                return nativeUnlocked ? "true" : "false";
            } catch (Exception ex) {
                return "false";
            }
        }

        @JavascriptInterface
        public String loadData() {
            if (!nativeUnlocked) return "__AUTH_REQUIRED__";
            String encrypted = getSharedPreferences(PREFS, MODE_PRIVATE).getString("encrypted_db", "");
            if (encrypted.isEmpty()) {
                dataReadFailed = false;
                return "{}";
            }
            try {
                String plainText = decryptLocalData(encrypted);
                dataReadFailed = false;
                return plainText;
            } catch (Exception ex) {
                // Never replace unreadable encrypted user records with an empty database.
                dataReadFailed = true;
                return "__DECRYPT_FAILED__";
            }
        }

        @JavascriptInterface
        public String saveData(String json) {
            if (!nativeUnlocked) return "error_locked";
            if (dataReadFailed) return "error_locked";
            try {
                // Refuse malformed or empty payloads before touching existing encrypted data.
                if (json == null || json.trim().isEmpty()) return "error_format";
                JSONObject parsed = new JSONObject(json);
                if (parsed.optJSONArray("companies") == null ||
                        parsed.optJSONArray("transactions") == null)
                    return "error_format";
                String encrypted = encryptLocalData(json);
                boolean saved = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString("encrypted_db", encrypted).commit();
                if (saved) pendingLocalRegistrationUsername = "";
                return saved ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String saveRestoredData(String json) {
            if (!nativeUnlocked) return "error_locked";
            // Called only after user consciously selects and decrypts a backup.
            try {
                JSONObject parsed = new JSONObject(json);
                if (parsed.optJSONArray("companies") == null ||
                        parsed.optJSONArray("transactions") == null)
                    return "error_format";
                String encrypted = encryptLocalData(json);
                boolean saved = getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString("encrypted_db", encrypted).commit();
                if (saved) dataReadFailed = false;
                return saved ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String saveBackup(String json, String password) {
            if (!nativeUnlocked) return "error_locked";
            try {
                String encrypted = encryptBackup(json == null ? "{}" : json, password);
                return saveBackupFile(encrypted) ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String decryptBackup(String envelope, String password) {
            if (!nativeUnlocked) return "ERROR";
            try {
                return MainActivity.this.decryptBackupEnvelope(envelope, password);
            } catch (Exception ex) {
                return "ERROR";
            }
        }

        @JavascriptInterface
        public void openInvoiceCamera() {
            if (!nativeUnlocked) return;
            runOnUiThread(() -> {
                if (embeddedCameraActive) return;
                try {
                    embeddedCameraActive = true;
                    Intent camera = new Intent(MainActivity.this, CameraCaptureActivity.class);
                    startActivityForResult(camera, EMBEDDED_CAMERA_REQUEST);
                } catch (Exception ex) {
                    embeddedCameraActive = false;
                    sendEmbeddedCameraStatus("Kamera açılamadı. Kamera iznini kontrol edin.", false);
                }
            });
        }

        @JavascriptInterface
        public void recognizeInvoiceImage(String base64Image) {
            if (base64Image == null || base64Image.isEmpty()) {
                sendInvoiceOcrResult(false, "", "Fotoğraf verisi bulunamadı.");
                return;
            }
            if (base64Image.length() > 22000000) {
                sendInvoiceOcrResult(false, "", "Fotoğraf çok büyük. Daha küçük bir görüntü seçin.");
                return;
            }
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            final Bitmap[] bitmapHolder = new Bitmap[1];
            try {
                byte[] bytes = Base64.getDecoder().decode(base64Image);
                Bitmap bitmap = decodeInvoiceBitmap(bytes);
                if (bitmap == null) {
                    recognizer.close();
                    sendInvoiceOcrResult(false, "", "Fotoğraf açılamadı.");
                    return;
                }
                bitmapHolder[0] = bitmap;
                InputImage image = InputImage.fromBitmap(bitmap, 0);
                recognizer.process(image)
                        .addOnSuccessListener(result ->
                                sendInvoiceOcrResult(true, result.getText(), "", result))
                        .addOnFailureListener(error ->
                                sendInvoiceOcrResult(false, "", "Fotoğraf okunamadı. Daha net bir görüntü deneyin."))
                        .addOnCompleteListener(task -> {
                            recognizer.close();
                            if (bitmapHolder[0] != null && !bitmapHolder[0].isRecycled()) {
                                bitmapHolder[0].recycle();
                            }
                        });
            } catch (Exception ex) {
                recognizer.close();
                sendInvoiceOcrResult(false, "", "Fotoğraf işlenirken hata oluştu.");
            }
        }

        @JavascriptInterface
        public void recognizeInvoicePdf(String base64Pdf) {
            new Thread(() -> recognizeInvoicePdfBytes(base64Pdf)).start();
        }

        @JavascriptInterface
        public void parseBankFile(String base64File, String filename) {
            new Thread(() -> parseBankFileBytes(base64File, filename)).start();
        }

        @JavascriptInterface
        public void checkForUpdate(String currentVersion) {
            new Thread(() -> checkForLatestRelease(currentVersion)).start();
        }

        @JavascriptInterface
        public void downloadAndInstallUpdate(String downloadUrl, String expectedDigest) {
            new Thread(() -> downloadUpdateApk(downloadUrl, expectedDigest)).start();
        }

        @JavascriptInterface
        public String saveCsvExport(String filename, String data) {
            if (!nativeUnlocked) return "error_locked";
            return saveExportFile(filename, "text/csv", data) ? "ok" : "error";
        }

        @JavascriptInterface
        public void openOfficialPortal(String portalId) {
            String url = null;
            if ("gib".equals(portalId)) url = "https://ebelge.gib.gov.tr/";
            else if ("digitaltax".equals(portalId)) url = "https://dijital.gib.gov.tr/";
            else if ("sgk".equals(portalId)) url = "https://e.sgk.gov.tr/Uygulamalar/Isveren";
            if (url == null) return;
            final String target = url;
            runOnUiThread(() -> {
                try {
                    Intent browser = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                    startActivity(browser);
                } catch (Exception ex) {
                    Toast.makeText(MainActivity.this, "Resmî portal açılamadı.", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void lockNative() { nativeUnlocked = false; activeLocalUsername = ""; }

        @JavascriptInterface
        public String changePin(String oldPin, String newPin) {
            if (!nativeUnlocked || oldPin == null || newPin == null ||
                    newPin.length() < 6 || newPin.length() > 32) return "error";
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                String saltText = prefs.getString("pin_salt", "");
                String hashText = prefs.getString("pin_hash", "");
                if (saltText.isEmpty() || hashText.isEmpty()) return "error";
                byte[] expected = Base64.getDecoder().decode(hashText);
                byte[] salt = Base64.getDecoder().decode(saltText);
                if (!MessageDigest.isEqual(expected, derivePinHash(oldPin, salt))) return "invalid_old";
                byte[] newSalt = new byte[16];
                new SecureRandom().nextBytes(newSalt);
                byte[] hashed = derivePinHash(newPin, newSalt);
                boolean ok = prefs.edit()
                        .putString("pin_salt", Base64.getEncoder().encodeToString(newSalt))
                        .putString("pin_hash", Base64.getEncoder().encodeToString(hashed))
                        .commit();
                return ok ? "ok" : "error";
            } catch (Exception ex) {
                return "error";
            }
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ex) {
                return "1.2.6";
            }
        }

        @JavascriptInterface
        public void showMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    message == null ? "" : message, Toast.LENGTH_SHORT).show());
        }
    }
}
