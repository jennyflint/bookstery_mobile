package com.bookstery.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.util.Base64;
import android.view.KeyEvent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Single native bridge for the reader: directory scanning, binary file access, PDF thumbnails,
 * storage permissions and hardware volume keys. All heavy work runs on background threads so
 * the WebView main thread is never blocked and no file content crosses the bridge as Base64.
 */
@CapacitorPlugin(
    name = "NativeReaderBridge",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_EXTERNAL_STORAGE }, alias = "legacyStorage")
    }
)
public class NativeReaderBridgePlugin extends Plugin {

    private static final int DEFAULT_MAX_DEPTH = 24;
    private static final int DEFAULT_THUMBNAIL_WIDTH = 360;
    private static final long VOLUME_THROTTLE_MS = 200L;
    private static final int COPY_BUFFER_SIZE = 256 * 1024;
    // Multiple of 3 so Base64 chunks concatenate into exactly the same text as one full encoding.
    private static final int HASH_CHUNK_SIZE = 3 * 64 * 1024;
    private static final String STREAM_CACHE_DIR = "book_streams";
    private static final String COVERS_DIR = "covers";
    private static final String EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents";

    private static final Set<String> SKIPPED_DIRECTORIES = new HashSet<>(Arrays.asList(
        "android", "dcim", "pictures", "node_modules", ".thumbnails", "$recycle.bin"
    ));

    // PdfRenderer is not thread safe; thumbnails are rendered one at a time.
    private static final Object PDF_LOCK = new Object();

    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private volatile boolean volumeInterceptionEnabled = false;
    private long lastVolumeEventAt = 0L;

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
        super.handleOnDestroy();
    }

    // ---------------------------------------------------------------------------------------
    // 1. Directory scanner
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void scanDirectory(final PluginCall call) {
        final String target = call.getString("uriOrPath");
        if (target == null || target.isEmpty()) {
            call.reject("uriOrPath is required");
            return;
        }
        final List<String> extensions = readExtensions(call.getArray("extensions"));
        if (extensions.isEmpty()) {
            call.reject("extensions must contain at least one entry");
            return;
        }
        final Integer requestedDepth = call.getInt("maxDepth", DEFAULT_MAX_DEPTH);
        final int maxDepth = requestedDepth == null ? DEFAULT_MAX_DEPTH : Math.max(0, requestedDepth);

        io.execute(() -> {
            try {
                JSArray files = new JSArray();
                if (target.startsWith("content://")) {
                    Uri uri = Uri.parse(target);
                    takePersistableReadPermission(uri);
                    String rootId = DocumentsContract.isDocumentUri(getContext(), uri)
                        ? DocumentsContract.getDocumentId(uri)
                        : DocumentsContract.getTreeDocumentId(uri);
                    try {
                        scanTree(uri, rootId, 0, maxDepth, extensions, files);
                    } catch (SecurityException revokedGrant) {
                        // The picker grant did not survive (e.g. app restart): with All files access the
                        // same folder can be walked through its real path instead.
                        String fallbackPath = documentIdToPath(uri, rootId);
                        if (fallbackPath.isEmpty() || !isAllFilesAccessGranted()) {
                            throw revokedGrant;
                        }
                        files = new JSArray();
                        scanFiles(new File(fallbackPath), 0, maxDepth, extensions, files);
                    }
                } else {
                    scanFiles(new File(stripFileScheme(target)), 0, maxDepth, extensions, files);
                }
                JSObject result = new JSObject();
                result.put("files", files);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Directory scan failed: " + e.getMessage(), e);
            }
        });
    }

    private void scanTree(
        Uri treeUri,
        String parentDocumentId,
        int depth,
        int maxDepth,
        List<String> extensions,
        JSArray out
    ) throws Exception {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
        String[] projection = {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };

        List<String> subDirectoryIds = new ArrayList<>();
        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) {
                return;
            }
            while (cursor.moveToNext()) {
                String documentId = cursor.getString(0);
                String name = cursor.getString(1);
                String mimeType = cursor.getString(2);
                if (documentId == null || name == null) {
                    continue;
                }

                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    if (depth < maxDepth && !isSkippedDirectory(name)) {
                        subDirectoryIds.add(documentId);
                    }
                    continue;
                }

                String extension = matchExtension(name, extensions);
                if (extension == null) {
                    continue;
                }
                Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                long size = cursor.isNull(3) ? 0L : cursor.getLong(3);
                long lastModified = cursor.isNull(4) ? 0L : cursor.getLong(4);
                out.put(buildEntry(
                    documentUri.toString(),
                    documentIdToPath(treeUri, documentId),
                    name,
                    extension,
                    size,
                    lastModified
                ));
            }
        }

        // Recurse after the cursor is closed so only one cursor is open at a time.
        for (String subDirectoryId : subDirectoryIds) {
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            scanTree(treeUri, subDirectoryId, depth + 1, maxDepth, extensions, out);
        }
    }

    private void scanFiles(File directory, int depth, int maxDepth, List<String> extensions, JSArray out) {
        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (Thread.currentThread().isInterrupted()) {
                return;
            }
            if (child.isDirectory()) {
                if (depth < maxDepth && !isSkippedDirectory(child.getName())) {
                    scanFiles(child, depth + 1, maxDepth, extensions, out);
                }
                continue;
            }
            String extension = matchExtension(child.getName(), extensions);
            if (extension == null) {
                continue;
            }
            String absolutePath = child.getAbsolutePath();
            out.put(buildEntry(
                "file://" + absolutePath,
                absolutePath,
                child.getName(),
                extension,
                child.length(),
                child.lastModified()
            ));
        }
    }

    private JSObject buildEntry(String uri, String path, String name, String extension, long size, long lastModified) {
        JSObject entry = new JSObject();
        entry.put("uri", uri);
        entry.put("path", path);
        entry.put("name", name);
        entry.put("extension", extension);
        entry.put("size", size);
        entry.put("lastModified", lastModified);
        return entry;
    }

    private static boolean isSkippedDirectory(String name) {
        return name.startsWith(".") || SKIPPED_DIRECTORIES.contains(name.toLowerCase(Locale.ROOT));
    }

    private static List<String> readExtensions(JSArray array) {
        List<String> result = new ArrayList<>();
        if (array == null) {
            return result;
        }
        for (int i = 0; i < array.length(); i++) {
            String raw = array.optString(i, "").trim().toLowerCase(Locale.ROOT);
            if (raw.isEmpty()) {
                continue;
            }
            result.add(raw.startsWith(".") ? raw : "." + raw);
        }
        // Longest first so ".fb2.zip" wins over ".zip".
        Collections.sort(result, (a, b) -> b.length() - a.length());
        return result;
    }

    /** Returns the matched extension without the leading dot, or null. */
    private static String matchExtension(String fileName, List<String> extensions) {
        String lower = fileName.toLowerCase(Locale.ROOT);
        for (String extension : extensions) {
            if (lower.endsWith(extension)) {
                return extension.substring(1);
            }
        }
        return null;
    }

    /** Best-effort filesystem path for documents on shared storage ("primary:Books/a.pdf"). */
    private static String documentIdToPath(Uri treeUri, String documentId) {
        if (!EXTERNAL_STORAGE_AUTHORITY.equals(treeUri.getAuthority())) {
            return "";
        }
        int separator = documentId.indexOf(':');
        if (separator < 0) {
            return "";
        }
        String volume = documentId.substring(0, separator);
        String relative = documentId.substring(separator + 1);
        String root = "primary".equals(volume) ? "/storage/emulated/0" : "/storage/" + volume;
        return relative.isEmpty() ? root : root + "/" + relative;
    }

    private static String stripFileScheme(String value) {
        if (value.startsWith("file://")) {
            return Uri.decode(value.substring("file://".length()));
        }
        return value;
    }

    // ---------------------------------------------------------------------------------------
    // 2. Binary file access (no Base64 over the bridge)
    // ---------------------------------------------------------------------------------------

    /**
     * Resolves a book to a local file path the WebView can fetch via Capacitor.convertFileSrc().
     * `content://` documents are streamed once into the cache directory and reused afterwards.
     */
    @PluginMethod
    public void resolveStreamableUrl(final PluginCall call) {
        final String target = call.getString("uriOrPath");
        if (target == null || target.isEmpty()) {
            call.reject("uriOrPath is required");
            return;
        }

        io.execute(() -> {
            try {
                JSObject result = new JSObject();
                if (target.startsWith("content://")) {
                    Uri uri = Uri.parse(target);
                    takePersistableReadPermission(uri);
                    boolean[] reused = new boolean[1];
                    File cached = cacheContentUri(uri, reused);
                    result.put("path", cached.getAbsolutePath());
                    result.put("size", cached.length());
                    result.put("cached", reused[0]);
                } else {
                    File file = new File(stripFileScheme(target));
                    if (!file.isFile()) {
                        call.reject("File not found: " + file.getAbsolutePath());
                        return;
                    }
                    result.put("path", file.getAbsolutePath());
                    result.put("size", file.length());
                    result.put("cached", false);
                }
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Unable to resolve file: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Copies a book into the app sandbox as `<destDir>/<hash>_<fileName>` in a single streaming
     * pass. The returned hash is SHA-256 of the Base64 text of the file, which is the identity
     * scheme the JS layer has always used, so existing library ids stay valid.
     */
    @PluginMethod
    public void copyToAppStorage(final PluginCall call) {
        final String target = call.getString("uriOrPath");
        final String fileName = call.getString("fileName");
        final String destDir = call.getString("destDir", "books");
        if (target == null || target.isEmpty() || fileName == null || fileName.isEmpty()) {
            call.reject("uriOrPath and fileName are required");
            return;
        }

        io.execute(() -> {
            File tmp = null;
            try {
                File root = getContext().getFilesDir();
                File dir = new File(root, destDir == null ? "books" : destDir);
                ensureInside(root, dir);
                if (!dir.isDirectory() && !dir.mkdirs()) {
                    throw new IOException("Cannot create " + dir.getAbsolutePath());
                }

                tmp = new File(dir, ".import_" + System.nanoTime() + ".part");
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long total = 0L;
                try (InputStream in = openInput(target); OutputStream out = new FileOutputStream(tmp)) {
                    byte[] buffer = new byte[HASH_CHUNK_SIZE];
                    int read;
                    while ((read = readFully(in, buffer)) > 0) {
                        out.write(buffer, 0, read);
                        digest.update(Base64.encode(buffer, 0, read, Base64.NO_WRAP));
                        total += read;
                    }
                }

                String hash = toHex(digest.digest());
                String safeName = sanitizeFileName(fileName);
                File dest = new File(dir, hash + "_" + safeName);
                if (dest.exists() && dest.length() == total) {
                    tmp.delete();
                } else if (!tmp.renameTo(dest)) {
                    throw new IOException("Cannot move file into " + dest.getAbsolutePath());
                }
                tmp = null;

                JSObject result = new JSObject();
                result.put("hash", hash);
                result.put("size", total);
                result.put("path", dest.getAbsolutePath());
                result.put("relativePath", (destDir == null ? "books" : destDir) + "/" + hash + "_" + safeName);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Copy failed: " + e.getMessage(), e);
            } finally {
                if (tmp != null) {
                    tmp.delete();
                }
            }
        });
    }

    private File cacheContentUri(Uri uri, boolean[] reused) throws IOException {
        long size = -1L;
        long modified = 0L;
        String displayName = "book";
        String[] projection = {
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };
        try (Cursor cursor = getContext().getContentResolver().query(uri, projection, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                if (!cursor.isNull(0)) displayName = cursor.getString(0);
                if (!cursor.isNull(1)) size = cursor.getLong(1);
                if (!cursor.isNull(2)) modified = cursor.getLong(2);
            }
        } catch (RuntimeException ignored) {
            // Providers without document columns: fall back to always re-copying.
        }

        File dir = new File(getContext().getCacheDir(), STREAM_CACHE_DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) {
            throw new IOException("Cannot create " + dir.getAbsolutePath());
        }
        File cached = new File(dir, sha1(uri.toString()) + "_" + sanitizeFileName(displayName));

        boolean sizeMatches = size >= 0 && cached.length() == size;
        boolean timeMatches = modified <= 0 || cached.lastModified() == modified;
        if (cached.isFile() && sizeMatches && timeMatches) {
            reused[0] = true;
            return cached;
        }

        File tmp = new File(dir, cached.getName() + ".part");
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(tmp)) {
            if (in == null) {
                throw new IOException("Cannot open " + uri);
            }
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        } catch (IOException e) {
            tmp.delete();
            throw e;
        }
        if (cached.exists() && !cached.delete()) {
            tmp.delete();
            throw new IOException("Cannot replace " + cached.getAbsolutePath());
        }
        if (!tmp.renameTo(cached)) {
            tmp.delete();
            throw new IOException("Cannot finalize " + cached.getAbsolutePath());
        }
        if (modified > 0) {
            cached.setLastModified(modified);
        }
        reused[0] = false;
        return cached;
    }

    private InputStream openInput(String target) throws IOException {
        if (target.startsWith("content://")) {
            Uri uri = Uri.parse(target);
            takePersistableReadPermission(uri);
            InputStream stream = getContext().getContentResolver().openInputStream(uri);
            if (stream == null) {
                throw new IOException("Cannot open " + target);
            }
            return stream;
        }
        return new java.io.FileInputStream(new File(stripFileScheme(target)));
    }

    private static int readFully(InputStream in, byte[] buffer) throws IOException {
        int total = 0;
        while (total < buffer.length) {
            int read = in.read(buffer, total, buffer.length - total);
            if (read < 0) {
                break;
            }
            total += read;
        }
        return total;
    }

    private static void ensureInside(File root, File candidate) throws IOException {
        String rootPath = root.getCanonicalPath();
        String candidatePath = candidate.getCanonicalPath();
        if (!candidatePath.equals(rootPath) && !candidatePath.startsWith(rootPath + File.separator)) {
            throw new IOException("Destination is outside the app storage");
        }
    }

    private static String sanitizeFileName(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        return cleaned.isEmpty() ? "book" : cleaned;
    }

    private static String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return toHex(digest.digest(value.getBytes("UTF-8")));
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(String.format(Locale.ROOT, "%02x", b));
        }
        return builder.toString();
    }

    // ---------------------------------------------------------------------------------------
    // 3. PDF cover thumbnails
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void generatePdfThumbnail(final PluginCall call) {
        final String target = call.getString("uriOrPath");
        final String bookId = call.getString("bookId");
        final Integer requestedWidth = call.getInt("maxWidth", DEFAULT_THUMBNAIL_WIDTH);
        final int maxWidth = requestedWidth == null || requestedWidth < 16 ? DEFAULT_THUMBNAIL_WIDTH : requestedWidth;
        if (target == null || target.isEmpty() || bookId == null || bookId.isEmpty()) {
            call.reject("uriOrPath and bookId are required");
            return;
        }

        io.execute(() -> {
            try {
                File coversDir = new File(getContext().getFilesDir(), COVERS_DIR);
                if (!coversDir.isDirectory() && !coversDir.mkdirs()) {
                    throw new IOException("Cannot create " + coversDir.getAbsolutePath());
                }
                File output = new File(coversDir, bookId.replaceAll("[^A-Za-z0-9_-]", "_") + ".webp");

                int[] size;
                try {
                    size = renderFirstPage(openPdfDescriptor(target, false), output, maxWidth);
                } catch (IOException | IllegalArgumentException notSeekable) {
                    if (!target.startsWith("content://")) {
                        throw notSeekable;
                    }
                    // Some providers hand out pipes that PdfRenderer cannot seek in: use a local copy.
                    size = renderFirstPage(openPdfDescriptor(target, true), output, maxWidth);
                }

                JSObject result = new JSObject();
                result.put("path", output.getAbsolutePath());
                result.put("width", size[0]);
                result.put("height", size[1]);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("PDF thumbnail failed: " + e.getMessage(), e);
            }
        });
    }

    private ParcelFileDescriptor openPdfDescriptor(String target, boolean forceLocalCopy) throws IOException {
        if (target.startsWith("content://")) {
            Uri uri = Uri.parse(target);
            takePersistableReadPermission(uri);
            if (!forceLocalCopy) {
                ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(uri, "r");
                if (pfd == null) {
                    throw new IOException("Cannot open " + target);
                }
                return pfd;
            }
            File cached = cacheContentUri(uri, new boolean[1]);
            return ParcelFileDescriptor.open(cached, ParcelFileDescriptor.MODE_READ_ONLY);
        }
        return ParcelFileDescriptor.open(new File(stripFileScheme(target)), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    /** Renders page 0 and always releases page, renderer and descriptor. Returns {width, height}. */
    private int[] renderFirstPage(ParcelFileDescriptor pfd, File output, int maxWidth) throws IOException {
        PdfRenderer renderer = null;
        PdfRenderer.Page page = null;
        Bitmap bitmap = null;
        try {
            synchronized (PDF_LOCK) {
                renderer = new PdfRenderer(pfd);
                if (renderer.getPageCount() == 0) {
                    throw new IOException("PDF has no pages");
                }
                page = renderer.openPage(0);

                float scale = maxWidth / (float) Math.max(page.getWidth(), 1);
                int width = Math.max(1, Math.round(page.getWidth() * scale));
                int height = Math.max(1, Math.min(Math.round(page.getHeight() * scale), maxWidth * 4));

                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                // PdfRenderer leaves the page transparent; covers need a white paper background.
                bitmap.eraseColor(Color.WHITE);
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);

                Bitmap.CompressFormat format = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? Bitmap.CompressFormat.WEBP_LOSSY
                    : Bitmap.CompressFormat.WEBP;
                try (OutputStream out = new FileOutputStream(output)) {
                    if (!bitmap.compress(format, 85, out)) {
                        throw new IOException("Bitmap compression failed");
                    }
                }
                return new int[] { width, height };
            }
        } finally {
            if (page != null) {
                try { page.close(); } catch (Exception ignored) { }
            }
            if (renderer != null) {
                try { renderer.close(); } catch (Exception ignored) { }
            }
            try { pfd.close(); } catch (Exception ignored) { }
            if (bitmap != null) {
                bitmap.recycle();
            }
        }
    }

    // ---------------------------------------------------------------------------------------
    // 4. Storage permissions
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void checkStoragePermission(PluginCall call) {
        call.resolve(buildPermissionStatus(false));
    }

    @PluginMethod
    public void requestStoragePermission(PluginCall call) {
        String uriValue = call.getString("uri");
        if (uriValue != null && uriValue.startsWith("content://")) {
            takePersistableReadPermission(Uri.parse(uriValue));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                call.resolve(buildPermissionStatus(false));
                return;
            }
            boolean opened = openAllFilesAccessSettings();
            call.resolve(buildPermissionStatus(opened));
            return;
        }

        if (isLegacyStorageGranted()) {
            call.resolve(buildPermissionStatus(false));
        } else {
            requestPermissionForAlias("legacyStorage", call, "legacyStoragePermissionCallback");
        }
    }

    @PermissionCallback
    private void legacyStoragePermissionCallback(PluginCall call) {
        call.resolve(buildPermissionStatus(true));
    }

    private JSObject buildPermissionStatus(boolean requested) {
        boolean allFilesRequired = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        boolean granted = allFilesRequired ? Environment.isExternalStorageManager() : isLegacyStorageGranted();
        JSObject status = new JSObject();
        status.put("granted", granted);
        status.put("allFilesAccessRequired", allFilesRequired);
        status.put("requested", requested);
        status.put("sdkVersion", Build.VERSION.SDK_INT);
        return status;
    }

    private static boolean isAllFilesAccessGranted() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager();
    }

    private boolean isLegacyStorageGranted() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private boolean openAllFilesAccessSettings() {
        Context context = getContext();
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + context.getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception primary) {
            try {
                Intent fallback = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                return true;
            } catch (Exception secondary) {
                return false;
            }
        }
    }

    private void takePersistableReadPermission(Uri uri) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException | UnsupportedOperationException ignored) {
            // Not granted as persistable (e.g. the picker did not offer it): access may still work this session.
        }
    }

    // ---------------------------------------------------------------------------------------
    // 5. Hardware volume keys
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void setVolumeInterception(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", false);
        volumeInterceptionEnabled = enabled != null && enabled;
        JSObject result = new JSObject();
        result.put("enabled", volumeInterceptionEnabled);
        call.resolve(result);
    }

    @PluginMethod
    public void isInterceptionEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", volumeInterceptionEnabled);
        call.resolve(result);
    }

    /** Called from MainActivity.dispatchKeyEvent. Returns true when the event was consumed. */
    public boolean handleVolumeKeyEvent(KeyEvent event) {
        if (!volumeInterceptionEnabled) {
            return false;
        }
        int keyCode = event.getKeyCode();
        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return false;
        }

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            long now = android.os.SystemClock.uptimeMillis();
            if (now - lastVolumeEventAt >= VOLUME_THROTTLE_MS) {
                lastVolumeEventAt = now;
                JSObject data = new JSObject();
                data.put("direction", keyCode == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
                notifyListeners("volumeKeyPressed", data);
            }
        }
        // Consumed (including key-up and repeats) so the system volume UI never appears.
        return true;
    }

    // ---------------------------------------------------------------------------------------
    // 6. Application lifecycle & navigation
    // ---------------------------------------------------------------------------------------

    @PluginMethod
    public void exitApp(final PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity is not available");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().moveTaskToBack(true);
                getActivity().finish();
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to exit app: " + e.getMessage(), e);
            }
        });
    }

    public void notifyBackButtonPressed() {
        notifyListeners("backButtonPressed", new JSObject());
    }
}
