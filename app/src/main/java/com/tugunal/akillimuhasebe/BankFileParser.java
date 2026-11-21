package com.tugunal.akillimuhasebe;

import org.json.JSONArray;
import org.json.JSONObject;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilderFactory;

/** Offline-only CSV/XLSX statement reader; importing does not create financial movements. */
public final class BankFileParser {
    private static final int MAX_FILE_BYTES = 8 * 1024 * 1024;
    private static final int MAX_XML_ENTRY_BYTES = 16 * 1024 * 1024;
    private static final int MAX_ROWS = 2500;
    private static final int MAX_COLS = 40;
    private static final int MAX_CELL_CHARS = 600;

    private BankFileParser() { }

    public static JSONObject parse(String encoded, String filename) throws Exception {
        if (encoded == null || encoded.length() > (MAX_FILE_BYTES * 4L / 3L + 8L)) {
            throw new IllegalArgumentException("Ekstre boyutu 8 MB sınırını aşıyor.");
        }
        byte[] bytes = Base64.getDecoder().decode(encoded);
        if (bytes.length == 0 || bytes.length > MAX_FILE_BYTES) {
            throw new IllegalArgumentException("Dosya boş veya 8 MB sınırından büyük.");
        }
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        List<List<String>> matrix;
        String format;
        if (name.endsWith(".xlsx")) {
            format = "XLSX";
            matrix = readXlsx(bytes);
        } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
            format = "CSV";
            matrix = readDelimited(bytes);
        } else {
            throw new IllegalArgumentException("Yalnızca CSV, TXT ve XLSX ekstreleri desteklenir.");
        }
        if (matrix.size() < 2) {
            throw new IllegalArgumentException("Ekstrede başlık ve işlem satırı bulunamadı.");
        }

        // Drop leading empty columns consistently.
        int maxWidth = 0;
        for (List<String> row : matrix) maxWidth = Math.max(maxWidth, row.size());
        maxWidth = Math.min(maxWidth, MAX_COLS);

        JSONArray headers = new JSONArray();
        for (int c = 0; c < maxWidth; c++) {
            String value = c < matrix.get(0).size() ? matrix.get(0).get(c) : "";
            headers.put(value.trim().isEmpty() ? "Sütun " + (c + 1) : value);
        }
        JSONArray rows = new JSONArray();
        for (int i = 1; i < matrix.size(); i++) {
            List<String> row = matrix.get(i);
            if (isEmpty(row)) continue;
            JSONArray resultRow = new JSONArray();
            for (int c = 0; c < maxWidth; c++) {
                resultRow.put(c < row.size() ? row.get(c) : "");
            }
            rows.put(resultRow);
        }
        if (rows.length() == 0) throw new IllegalArgumentException("İşlem satırı bulunamadı.");
        JSONObject result = new JSONObject();
        result.put("success", true);
        result.put("format", format);
        result.put("headers", headers);
        result.put("rows", rows);
        result.put("filename", filename == null ? "" : filename);
        result.put("truncated", rows.length() >= MAX_ROWS - 1);
        return result;
    }

    private static boolean isEmpty(List<String> row) {
        for (String s : row) if (!s.trim().isEmpty()) return false;
        return true;
    }

    private static List<List<String>> readDelimited(byte[] bytes) throws Exception {
        String s;
        if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xfe) {
            s = new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        } else if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xfe && (bytes[1] & 0xff) == 0xff) {
            s = new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        } else {
            int offset = bytes.length >= 3 && (bytes[0] & 0xff) == 0xef
                    && (bytes[1] & 0xff) == 0xbb && (bytes[2] & 0xff) == 0xbf ? 3 : 0;
            ByteBuffer buffer = ByteBuffer.wrap(bytes, offset, bytes.length - offset);
            try {
                s = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(buffer).toString();
            } catch (CharacterCodingException ex) {
                s = new String(bytes, offset, bytes.length - offset, Charset.forName("windows-1254"));
            }
        }
        if (s.length() > 8_000_000) throw new IllegalArgumentException("Ekstre çok fazla satır içeriyor.");
        char separator = delimiter(s);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i <= s.length(); i++) {
            char ch = i == s.length() ? '\n' : s.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < s.length() && s.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else quoted = !quoted;
            } else if (ch == separator && !quoted) {
                addCell(row, field);
                if (row.size() >= MAX_COLS) throw new IllegalArgumentException("Çok fazla sütun var.");
            } else if ((ch == '\r' || ch == '\n') && !quoted) {
                if (ch == '\r' && i + 1 < s.length() && s.charAt(i + 1) == '\n') i++;
                addCell(row, field);
                if (!isEmpty(row)) rows.add(row);
                if (rows.size() >= MAX_ROWS) break;
                row = new ArrayList<>();
            } else {
                if (field.length() < MAX_CELL_CHARS) field.append(ch);
            }
        }
        return rows;
    }

    private static void addCell(List<String> row, StringBuilder field) {
        row.add(field.toString().trim());
        field.setLength(0);
    }

    private static char delimiter(String s) {
        int semicolons = 0, commas = 0, tabs = 0;
        boolean quoted = false;
        for (int i = 0; i < s.length() && i < 3000; i++) {
            char ch = s.charAt(i);
            if (ch == '"') quoted = !quoted;
            else if (!quoted) {
                if (ch == '\n' || ch == '\r') break;
                if (ch == ';') semicolons++;
                else if (ch == ',') commas++;
                else if (ch == '\t') tabs++;
            }
        }
        if (tabs > semicolons && tabs > commas) return '\t';
        return semicolons >= commas ? ';' : ',';
    }

    private static List<List<String>> readXlsx(byte[] bytes) throws Exception {
        byte[] shared = null, sheet = null;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            int entries = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 500) throw new IllegalArgumentException("Excel arşivinde çok fazla dosya var.");
                String name = entry.getName();
                if (name.equals("xl/sharedStrings.xml")) {
                    shared = readEntry(zip);
                } else if (name.equals("xl/worksheets/sheet1.xml")) {
                    sheet = readEntry(zip);
                } else if (sheet == null && name.startsWith("xl/worksheets/sheet")
                        && name.endsWith(".xml")) {
                    sheet = readEntry(zip);
                }
                zip.closeEntry();
            }
        }
        if (sheet == null) throw new IllegalArgumentException("Excel sayfası bulunamadı.");
        List<String> strings = new ArrayList<>();
        if (shared != null) {
            Document sharedDoc = parseXml(shared);
            NodeList items = sharedDoc.getElementsByTagName("si");
            for (int i = 0; i < items.getLength() && i < 100000; i++) {
                Element element = (Element) items.item(i);
                NodeList texts = element.getElementsByTagName("t");
                StringBuilder out = new StringBuilder();
                for (int j = 0; j < texts.getLength(); j++) out.append(texts.item(j).getTextContent());
                strings.add(trim(out.toString()));
            }
        }
        Document sheetDoc = parseXml(sheet);
        NodeList xmlRows = sheetDoc.getElementsByTagName("row");
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < xmlRows.getLength() && out.size() < MAX_ROWS; i++) {
            Element rowEl = (Element) xmlRows.item(i);
            NodeList cells = rowEl.getElementsByTagName("c");
            String[] values = new String[MAX_COLS];
            Arrays.fill(values, "");
            int sequentialIndex = 0;
            int highestCol = -1;
            for (int c = 0; c < cells.getLength(); c++) {
                Element el = (Element) cells.item(c);
                int col = columnIndex(el.getAttribute("r"));
                if (col < 0) col = sequentialIndex;
                sequentialIndex = col + 1;
                if (col >= MAX_COLS) continue;
                String type = el.getAttribute("t");
                String raw = firstTagText(el, "v");
                String value;
                if ("s".equals(type)) {
                    int index = safeInt(raw, -1);
                    value = index >= 0 && index < strings.size() ? strings.get(index) : "";
                } else if ("inlineStr".equals(type)) {
                    StringBuilder b = new StringBuilder();
                    NodeList textNodes = el.getElementsByTagName("t");
                    for (int t = 0; t < textNodes.getLength(); t++) b.append(textNodes.item(t).getTextContent());
                    value = b.toString();
                } else {
                    value = raw;
                }
                values[col] = trim(value);
                highestCol = Math.max(highestCol, col);
            }
            if (highestCol >= 0) {
                List<String> row = new ArrayList<>(highestCol + 1);
                for (int c = 0; c <= highestCol; c++) row.add(values[c]);
                if (!isEmpty(row)) out.add(row);
            }
        }
        return out;
    }

    private static String firstTagText(Element element, String tag) {
        NodeList items = element.getElementsByTagName(tag);
        return items.getLength() == 0 ? "" : items.item(0).getTextContent();
    }

    private static int safeInt(String s, int fallback) {
        try { return Integer.parseInt(s.trim()); } catch (Exception ex) { return fallback; }
    }

    private static int columnIndex(String cellRef) {
        int result = 0, consumed = 0;
        for (int i = 0; i < cellRef.length(); i++) {
            char ch = Character.toUpperCase(cellRef.charAt(i));
            if (ch < 'A' || ch > 'Z') break;
            result = result * 26 + (ch - 'A' + 1);
            consumed++;
        }
        return consumed == 0 ? -1 : result - 1;
    }

    private static String trim(String s) {
        if (s == null) return "";
        return s.length() > MAX_CELL_CHARS ? s.substring(0, MAX_CELL_CHARS) : s;
    }

    private static byte[] readEntry(ZipInputStream zip) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = zip.read(buffer)) != -1) {
            out.write(buffer, 0, count);
            if (out.size() > MAX_XML_ENTRY_BYTES) {
                throw new IllegalArgumentException("Excel dosyası boyut sınırını aştı.");
            }
        }
        return out.toByteArray();
    }

    private static Document parseXml(byte[] xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
    }
}
