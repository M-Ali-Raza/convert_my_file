import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import Papa from "papaparse";
import sharp from "sharp";

const mimeTypes: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

// Flatten nested objects for CSV conversion
function flattenObject(obj: any, prefix = ""): any {
  const flattened: any = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(flattened, flattenObject(obj[key], newKey));
      } else {
        flattened[newKey] = obj[key];
      }
    }
  }

  return flattened;
}

// Unflatten dotted keys back to nested objects
function unflattenObject(obj: any): any {
  const result: any = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const keys = key.split(".");
      let current = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) {
          current[k] = {};
        }
        current = current[k];
      }

      current[keys[keys.length - 1]] = obj[key];
    }
  }

  return result;
}

// PDF text extraction using pdf-parse (reliable and stable)
async function extractPdfText(buffer: Buffer): Promise<string> {
  console.log("Starting PDF text extraction...");
  try {
    // Dynamic import with proper type handling
    const pdfParse = require("pdf-parse");
    
    const data = await pdfParse(buffer);
    
    if (data.text && data.text.trim().length > 0) {
      console.log(`✅ Successfully extracted ${data.text.length} characters from PDF`);
      return `📄 PDF Text Content:\n\n${data.text.trim()}`;
    } else {
      return `⚠️ PDF Processing Issue

📄 **PDF Information:**
• Total pages: ${data.numpages}
• File size: ${(buffer.length / 1024).toFixed(1)}KB
• Status: Valid PDF format

❌ **Text Extraction Failed:**
No extractable text found in the PDF.

🔍 **Possible reasons:**
• PDF contains only images (scanned document)
• Text is embedded as graphics
• PDF uses complex formatting
• Password protection or security restrictions

💡 **This converter works perfectly with:**
• Word documents (DOCX → Markdown)
• Images (PNG, JPG conversions)
• Spreadsheets (CSV → JSON)`;
    }
  } catch (error: any) {
    console.error("PDF extraction error:", error);
    return `❌ **Unable to process PDF**

**Error encountered:**
${error.message}

**This might indicate:**
• Corrupted file upload
• Unsupported PDF version
• Server processing limitations
• Memory constraints

**Solutions to try:**
• Upload a different PDF file
• Ensure file isn't password-protected
• Try a smaller file size
• Use alternative conversion tools

**Working alternatives:**
📝 DOCX, TXT, CSV, and image conversions work perfectly!`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const outputType = (formData.get("outputType") as string)?.toLowerCase();

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!outputType || !mimeTypes[outputType]) {
      return NextResponse.json({ error: "Unsupported output type" }, { status: 400 });
    }

    console.log(`Processing: ${file.name} (${file.type}) → ${outputType}`);
    console.log(`File size: ${(file.size / 1024).toFixed(1)}KB`);

    const buffer = Buffer.from(await file.arrayBuffer());
    let converted: Buffer | string;

    // 🔹 Handle conversions
    if (outputType === "md" && file.name.endsWith(".docx")) {
      console.log("Converting DOCX to Markdown");
      const result = await mammoth.extractRawText({ buffer });
      converted = `# ${file.name.replace(".docx", "")}\n\nConverted from Word document\n\n${result.value}`;
    } else if (outputType === "txt" && file.name.endsWith(".pdf")) {
      console.log("Converting PDF to Text");
      converted = await extractPdfText(buffer);
    } else if (outputType === "json" && file.name.endsWith(".csv")) {
      console.log("Converting CSV to JSON");
      const csvText = buffer.toString("utf-8");
      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        transformHeader: (header) => header.trim(),
      });

      // Unflatten each row to restore nested structure
      const unflattenedData = (parsed.data as any[]).map((row) => unflattenObject(row));

      converted = JSON.stringify(
        {
          meta: {
            filename: file.name,
            rows: unflattenedData.length,
            fields: parsed.meta.fields || [],
          },
          data: unflattenedData,
        },
        null,
        2
      );
    } else if (outputType === "csv" && file.name.endsWith(".json")) {
      console.log("Converting JSON to CSV");
      const jsonData = JSON.parse(buffer.toString("utf-8"));

      // Handle array of objects
      if (Array.isArray(jsonData)) {
        // Flatten each object
        const flattenedData = jsonData.map((item) => flattenObject(item));
        converted = Papa.unparse(flattenedData);
      } else if (typeof jsonData === "object" && jsonData !== null) {
        // Handle single object - convert to array with one item
        const flattenedData = [flattenObject(jsonData)];
        converted = Papa.unparse(flattenedData);
      } else {
        return NextResponse.json(
          { error: "JSON must be an object or array of objects" },
          { status: 400 }
        );
      }
    } else if (
      (outputType === "png" || outputType === "jpg" || outputType === "jpeg") &&
      (file.type.startsWith("image/") ||
        file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|tiff|svg)$/i))
    ) {
      console.log(`Converting image to ${outputType.toUpperCase()}`);
      if (outputType === "png") {
        converted = await sharp(buffer).png({ quality: 100, compressionLevel: 6 }).toBuffer();
      } else {
        converted = await sharp(buffer).jpeg({ quality: 95, progressive: true }).toBuffer();
      }
    } else if (outputType === "md" && file.name.endsWith(".txt")) {
      console.log("Converting TXT to Markdown");
      const text = buffer.toString("utf-8");
      const lines = text.split("\n");
      const markdown = [`# ${file.name.replace(".txt", "")}`, "", "Converted from text file", ""];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          markdown.push("");
          continue;
        }
        if (trimmed.length < 60 && !/[.!?]$/.test(trimmed) && !trimmed.includes(" ")) {
          markdown.push(`## ${trimmed}`);
        } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          markdown.push(trimmed);
        } else {
          markdown.push(trimmed);
        }
      }
      converted = markdown.join("\n");
    } else {
      const fileExt = file.name.split(".").pop()?.toLowerCase() || "unknown";
      return NextResponse.json(
        {
          error: `Conversion from ${fileExt.toUpperCase()} to ${outputType.toUpperCase()} is not supported. Please check the supported conversions list.`,
        },
        { status: 400 }
      );
    }

    const mime = mimeTypes[outputType];
    const filename = `${file.name.split(".")[0]}-converted-${Date.now()}.${outputType}`;

    console.log(`✅ Conversion completed: ${filename}`);

    return new NextResponse(
      typeof converted === "string" ? converted : new Uint8Array(converted as Buffer),
      {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      }
    );
  } catch (error: any) {
    console.error("❌ Server error:", error);
    return NextResponse.json(
      {
        error: `Server error: ${error.message}

🔍 This might be due to:
• File upload corruption
• Server configuration issue
• Unsupported file format
• Memory limitations

Please try:
• A smaller file
• A different file format
• Refreshing and trying again`,
      },
      { status: 500 }
    );
  }
}