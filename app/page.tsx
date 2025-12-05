"use client";

import { useState } from "react";

export default function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [outputType, setOutputType] = useState<string>("md");
  const [splitMode, setSplitMode] = useState<string>("whole");
  const [convertedText, setConvertedText] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleConvert = async () => {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      alert(
        `File is too large. Maximum size allowed is ${maxSize / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`
      );
      return;
    }

    setIsConverting(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("outputType", outputType);
    formData.append("splitMode", splitMode);

    try {
      const res = await fetch("/api/converter", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("Content-Type") || "";

      if (!res.ok) {
        let errorMessage = "Unknown error occurred";
        if (res.status === 413) {
          errorMessage = "File is too large. Please try with a smaller file.";
        } else if (contentType.includes("json")) {
          try {
            const errorData = await res.json();
            errorMessage = errorData.error || `Error ${res.status}: ${res.statusText}`;
          } catch {
            errorMessage = `Error ${res.status}: ${res.statusText}`;
          }
        } else if (contentType.includes("text/html")) {
          errorMessage =
            res.status === 413
              ? "File size exceeds server limit. Please try with a smaller file."
              : `Server error (${res.status}). Please try again.`;
        } else {
          try {
            const errorText = await res.text();
            errorMessage = errorText || `Error ${res.status}: ${res.statusText}`;
          } catch {
            errorMessage = `Error ${res.status}: ${res.statusText}`;
          }
        }
        alert("Conversion failed: " + errorMessage);
        return;
      }

      if (contentType.startsWith("text/") || contentType.includes("json")) {
        const text = await res.text();
        setConvertedText(text);
        const blob = new Blob([text], { type: contentType });
        downloadFile(blob, `converted.${outputType}`);
      } else {
        const blob = await res.blob();
        downloadFile(blob, `converted.${outputType}`);
        setConvertedText(null);
      }
    } catch (error: any) {
      console.error("Conversion error:", error);
      alert("Conversion failed: " + (error?.message || "Network error occurred"));
    } finally {
      setIsConverting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-4">Universal File Converter</h1>

      {/* Available Conversions Info */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h2 className="font-semibold text-blue-900 mb-2">📋 Supported Conversions:</h2>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 📄 DOCX → Markdown (.md)</li>
          <li>• 📑 PDF → Text (.txt) - Limited support</li>
          <li>• 📊 CSV → JSON (.json)</li>
          <li>• 📋 JSON → CSV (.csv)</li>
          <li>• 🖼️ Images → PNG/JPG (.png/.jpg)</li>
          <li>• 📝 TXT → Markdown (.md)</li>
        </ul>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onClick={() => document.getElementById("fileInput")?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-400 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition-colors"
      >
        {file ? (
          <div className="text-green-600">
            <p className="font-medium">{file.name}</p>
            <p className="text-sm">{formatFileSize(file.size)}</p>
            {file.size > 10 * 1024 * 1024 && (
              <p className="text-red-500 text-xs mt-1">⚠️ File exceeds 10MB limit</p>
            )}
          </div>
        ) : (
          <div className="text-gray-600">
            <p>Drag & drop a file here, or click to select</p>
            <p className="text-xs mt-1">Maximum file size: 10MB</p>
          </div>
        )}
        <input
          type="file"
          onChange={handleFileChange}
          className="hidden"
          id="fileInput"
        />
      </div>

      <div className="mt-4">
        <label className="block font-medium">Output Type</label>
        <select
          value={outputType}
          onChange={(e) => setOutputType(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="md">Markdown (.md)</option>
          <option value="txt">Text (.txt)</option>
          <option value="pdf">PDF (.pdf)</option>
          <option value="docx">Word (.docx)</option>
          <option value="csv">CSV (.csv)</option>
          <option value="json">JSON (.json)</option>
          <option value="png">PNG (.png)</option>
          <option value="jpg">JPG (.jpg)</option>
        </select>
      </div>

      {/* Convert Button */}
      <button
        onClick={handleConvert}
        disabled={!file || isConverting || (file !== null && file.size > 10 * 1024 * 1024)}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isConverting ? "Converting..." : "Convert"}
      </button>
    </div>
  );
}