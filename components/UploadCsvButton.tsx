"use client";

import { useRef, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

export function UploadCsvButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const generateUploadUrl = useMutation(api.universities.generateUploadUrl);
  const parseCsv = useAction(api.actions.ingest.parseCsv);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Generate a short-lived upload URL
      const postUrl = await generateUploadUrl();

      // 2. Upload the file to Convex Storage
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();

      // 3. Trigger the action to parse and ingest the CSV
      const response = await parseCsv({ storageId });
      alert(`Success! Imported ${response.count} universities.`);

    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload and parse CSV. Check console for details.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        type="file"
        accept=".csv"
        className="hidden"
        aria-label="Upload CSV file"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
      >
        {isUploading ? "Uploading..." : "+ Upload CSV"}
      </button>
    </>
  );
}
