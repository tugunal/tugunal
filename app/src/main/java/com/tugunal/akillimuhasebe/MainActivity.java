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
    private static final String PREFS = "akilli_muhasebe_secure";
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
                    boolean separateInstall = getPackageName().endsWith(".kurulum");
                    boolean rightPackage = separateInstall ? name.endsWith("-KURULUM.apk")
                                                           : !name.endsWith("-KURULUM.apk");
                    if (name.toLowerCase(Locale.ROOT).endsWith(".apk")
                            && name.startsWith("AkilliMuhasebe-") && rightPackage) {
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
            URL url = new URL(downloadUrl);
            if (!"https".equalsIgnoreCase(url.getProtocol())
                    || !"github.com".equalsIgnoreCase(url.getHost())
                    || !url.getPath().startsWith("/tugunal/tugunal/releases/download/")) {
                throw new IllegalArgumentException("Güvenilmeyen güncelleme adresi.");
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
        public String hasPin() {
            return getSharedPreferences(PREFS, MODE_PRIVATE).contains("pin_hash") ? "true" : "false";
        }

        @JavascriptInterface
        public String setPin(String pin) {
            try {
                if (pin == null || pin.length() < 6 || pin.length() > 32) return "invalid";
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
                String encrypted = encryptLocalData(json == null ? "{}" : json);
                getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                        .putString("encrypted_db", encrypted).apply();
                return "ok";
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
                if (!parsed.has("companies") || !parsed.has("transactions"))
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
        public void lockNative() { nativeUnlocked = false; }

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
                return "1.2.1";
            }
        }

        @JavascriptInterface
        public void showMessage(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this,
                    message == null ? "" : message, Toast.LENGTH_SHORT).show());
        }
    }
}
