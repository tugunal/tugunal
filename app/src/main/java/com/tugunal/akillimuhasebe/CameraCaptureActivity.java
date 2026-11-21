package com.tugunal.akillimuhasebe;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.media.ExifInterface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;

/**
 * Embedded camera. No external camera application or gallery navigation is needed.
 * Only the photo explicitly confirmed by the user is handed back to MainActivity.
 */
public final class CameraCaptureActivity extends ComponentActivity {
    public static final String EXTRA_CAPTURED_PATH = "captured_file_path";
    private static final int CAMERA_PERMISSION_REQUEST = 4801;

    private PreviewView previewView;
    private ImageView imageReview;
    private TextView instruction;
    private Button captureButton;
    private Button retakeButton;
    private Button acceptButton;
    private Button torchButton;

    private ProcessCameraProvider provider;
    private ImageCapture imageCapture;
    private Camera camera;
    private File tempPhoto;
    private boolean captureBusy;
    private boolean torchEnabled;
    private boolean photoDelivered;

    private int dp(float n) {
        return (int) (n * getResources().getDisplayMetrics().density + 0.5f);
    }

    private Button actionButton(String title, int backgroundColor) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(title);
        button.setTextColor(Color.WHITE);
        button.setTextSize(15f);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(backgroundColor));
        return button;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        root.addView(previewView, new FrameLayout.LayoutParams(-1, -1));

        imageReview = new ImageView(this);
        imageReview.setBackgroundColor(Color.BLACK);
        imageReview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        imageReview.setVisibility(View.GONE);
        root.addView(imageReview, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(15), dp(14), dp(15), dp(12));
        top.setBackgroundColor(0xBB081525);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        Button cancelButton = actionButton("‹ Geri", 0xFF28354D);
        header.addView(cancelButton, new LinearLayout.LayoutParams(dp(102), dp(49)));
        cancelButton.setOnClickListener(v -> finish());

        TextView title = new TextView(this);
        title.setText("Belge Kamerası");
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        title.setTextSize(19);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, dp(49), 1);
        header.addView(title, titleParams);

        torchButton = actionButton("Işık: Kapalı", 0xFF344767);
        header.addView(torchButton, new LinearLayout.LayoutParams(dp(126), dp(49)));
        torchButton.setOnClickListener(v -> toggleTorch());

        top.addView(header);
        instruction = new TextView(this);
        instruction.setText("Faturayı veya fişi ekrana sığdırın. Yazılar net görünmeli.");
        instruction.setTextColor(0xFFE4EAF4);
        instruction.setGravity(Gravity.CENTER);
        instruction.setTextSize(13);
        instruction.setPadding(0, dp(6), 0, 0);
        top.addView(instruction);
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP);
        root.addView(top, topParams);

        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.CENTER);
        bottom.setPadding(dp(14), dp(16), dp(14), dp(22));
        bottom.setBackgroundColor(0xCC081525);

        captureButton = actionButton("● Fotoğraf Çek", 0xFF2563EB);
        LinearLayout.LayoutParams captureParams = new LinearLayout.LayoutParams(-1, dp(64));
        bottom.addView(captureButton, captureParams);
        captureButton.setOnClickListener(v -> takePhoto());

        retakeButton = actionButton("Yeniden Çek", 0xFF45556E);
        acceptButton = actionButton("Fotoğrafı Kullan ✓", 0xFF0F9F6E);
        LinearLayout.LayoutParams halfA = new LinearLayout.LayoutParams(0, dp(60), 1);
        halfA.setMargins(0, 0, dp(8), 0);
        bottom.addView(retakeButton, halfA);
        bottom.addView(acceptButton, new LinearLayout.LayoutParams(0, dp(60), 1));
        retakeButton.setVisibility(View.GONE);
        acceptButton.setVisibility(View.GONE);

        retakeButton.setOnClickListener(v -> retake());
        acceptButton.setOnClickListener(v -> acceptPhoto());
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(bottom, bottomParams);
        setContentView(root);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            if (isFinishing() || isDestroyed()) return;
            try {
                provider = future.get();
                CameraSelector selector = provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
                        ? CameraSelector.DEFAULT_BACK_CAMERA
                        : CameraSelector.DEFAULT_FRONT_CAMERA;
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                        .setFlashMode(ImageCapture.FLASH_MODE_OFF)
                        .build();
                provider.unbindAll();
                camera = provider.bindToLifecycle(this, selector, preview, imageCapture);
                if (camera == null || !camera.getCameraInfo().hasFlashUnit()) {
                    torchButton.setEnabled(false);
                    torchButton.setText("Işık yok");
                }
            } catch (Exception error) {
                Toast.makeText(this, "Kamera açılamadı. Telefon izinlerini kontrol edin.",
                        Toast.LENGTH_LONG).show();
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void toggleTorch() {
        if (camera == null || !camera.getCameraInfo().hasFlashUnit()) return;
        torchEnabled = !torchEnabled;
        torchButton.setText(torchEnabled ? "Işık: Açık" : "Işık: Kapalı");
        camera.getCameraControl().enableTorch(torchEnabled);
    }

    private void takePhoto() {
        if (imageCapture == null || captureBusy) {
            if (imageCapture == null) Toast.makeText(this,
                    "Kamera hazırlanıyor.", Toast.LENGTH_SHORT).show();
            return;
        }
        captureBusy = true;
        captureButton.setEnabled(false);
        instruction.setText("Fotoğraf çekiliyor...");
        File candidate = new File(getCacheDir(),
                "document_capture_" + System.currentTimeMillis() + ".jpg");
        ImageCapture.OutputFileOptions options =
                new ImageCapture.OutputFileOptions.Builder(candidate).build();
        imageCapture.takePicture(options, ContextCompat.getMainExecutor(this),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults output) {
                        captureBusy = false;
                        if (candidate.length() == 0) {
                            candidate.delete();
                            captureButton.setEnabled(true);
                            instruction.setText("Boş fotoğraf oluştu. Tekrar deneyin.");
                            return;
                        }
                        if (tempPhoto != null && tempPhoto.exists()) tempPhoto.delete();
                        tempPhoto = candidate;
                        showReview(candidate);
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException ex) {
                        captureBusy = false;
                        candidate.delete();
                        captureButton.setEnabled(true);
                        instruction.setText("Fotoğraf çekilemedi. Tekrar deneyin.");
                        Toast.makeText(CameraCaptureActivity.this, "Kamera hatası: "
                                + ex.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private Bitmap previewBitmap(File file) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            int sample = 1;
            int max = Math.max(bounds.outWidth, bounds.outHeight);
            while (max / sample > 1800) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            options.inPreferredConfig = Bitmap.Config.RGB_565;
            Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath(), options);
            if (bitmap == null) return null;
            ExifInterface exif = new ExifInterface(file.getAbsolutePath());
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL);
            int degrees = orientation == ExifInterface.ORIENTATION_ROTATE_90 ? 90
                    : orientation == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                    : orientation == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            if (degrees == 0) return bitmap;
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(),
                    bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) bitmap.recycle();
            return rotated;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void showReview(File file) {
        Bitmap bitmap = previewBitmap(file);
        if (bitmap == null) {
            captureButton.setEnabled(true);
            instruction.setText("Ön izleme açılamadı. Yeniden çekin.");
            return;
        }
        imageReview.setImageBitmap(bitmap);
        imageReview.setVisibility(View.VISIBLE);
        previewView.setVisibility(View.INVISIBLE);
        captureButton.setVisibility(View.GONE);
        retakeButton.setVisibility(View.VISIBLE);
        acceptButton.setVisibility(View.VISIBLE);
        torchButton.setVisibility(View.INVISIBLE);
        instruction.setText("Yazılar okunuyor mu? Fotoğrafı kullanın veya yeniden çekin.");
    }

    private void retake() {
        if (tempPhoto != null && tempPhoto.exists()) tempPhoto.delete();
        tempPhoto = null;
        imageReview.setImageDrawable(null);
        imageReview.setVisibility(View.GONE);
        previewView.setVisibility(View.VISIBLE);
        captureButton.setVisibility(View.VISIBLE);
        captureButton.setEnabled(true);
        retakeButton.setVisibility(View.GONE);
        acceptButton.setVisibility(View.GONE);
        torchButton.setVisibility(View.VISIBLE);
        instruction.setText("Faturayı veya fişi ekrana sığdırın. Yazılar net görünmeli.");
    }

    private void acceptPhoto() {
        if (tempPhoto == null || !tempPhoto.exists()) return;
        Intent result = new Intent();
        result.putExtra(EXTRA_CAPTURED_PATH, tempPhoto.getAbsolutePath());
        photoDelivered = true;
        setResult(RESULT_OK, result);
        finish();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            Toast.makeText(this, "Fotoğraf çekmek için kamera izni gerekli.",
                    Toast.LENGTH_LONG).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onDestroy() {
        if (!photoDelivered && tempPhoto != null && tempPhoto.exists()) tempPhoto.delete();
        super.onDestroy();
    }
}
