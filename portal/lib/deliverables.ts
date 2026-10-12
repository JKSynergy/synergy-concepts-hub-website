export const DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;
export const DELIVERABLE_MAX_LABEL_LENGTH = 180;

const ALLOWED_EXTENSIONS = new Set([
  "7z", "ai", "csv", "doc", "docx", "eps", "gif", "indd", "jpeg", "jpg", "m4a",
  "mov", "mp3", "mp4", "pdf", "png", "ppt", "pptx", "psd", "rar", "rtf", "tif",
  "tiff", "txt", "wav", "webm", "webp", "xls", "xlsx", "zip",
]);

const BLOCKED_MIME_TYPES = new Set([
  "application/hta",
  "application/javascript",
  "application/x-httpd-php",
  "application/x-msdownload",
  "application/x-sh",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "text/xml",
]);

export const DELIVERABLE_ALLOWED_MIME_TYPES = [
  "application/msword",
  "application/octet-stream",
  "application/pdf",
  "application/postscript",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/zip",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.adobe.photoshop",
  "image/webp",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

const MIME_BY_EXTENSION: Record<string, (typeof DELIVERABLE_ALLOWED_MIME_TYPES)[number]> = {
  "7z": "application/x-7z-compressed",
  ai: "application/pdf",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  eps: "application/postscript",
  gif: "image/gif",
  indd: "application/octet-stream",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  m4a: "audio/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  psd: "image/vnd.adobe.photoshop",
  rar: "application/vnd.rar",
  rtf: "application/rtf",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export function deliverableExtension(fileName: string): string {
  const name = fileName.trim().toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : "";
}

export function validateDeliverableFile(input: {
  fileName: string;
  fileSize: number;
  fileType: string;
}): { contentType?: string; error?: string } {
  const extension = deliverableExtension(input.fileName);
  const contentType = MIME_BY_EXTENSION[extension];
  if (!extension || !ALLOWED_EXTENSIONS.has(extension) || !contentType) {
    return { error: "This file type is not allowed" };
  }
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0) {
    return { error: "A non-empty file is required" };
  }
  if (input.fileSize > DELIVERABLE_MAX_BYTES) {
    return { error: "Files must be 50 MB or smaller" };
  }

  const suppliedType = input.fileType.trim().toLowerCase().split(";", 1)[0];
  if (BLOCKED_MIME_TYPES.has(suppliedType)) {
    return { error: "This file type is not allowed" };
  }

  // Browser MIME reporting varies for creative source files. Upload with one
  // canonical bucket-approved type derived from the already-approved extension.
  return { contentType };
}

export function validateDeliverableLabel(value: string): string | null {
  const label = value.trim();
  if (!label || label.length > DELIVERABLE_MAX_LABEL_LENGTH || /[\u0000-\u001f\u007f]/.test(label)) return null;
  return label;
}
