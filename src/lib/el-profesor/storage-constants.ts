// Not "server-only" — this single constant is shared by server code
// (storage.ts) and client components that need to talk to the bucket
// directly (large PDF uploads via a signed upload URL, bypassing the
// Server Action body size limit entirely — see actions/pdf-upload.ts).
export const EL_PROFESOR_PDF_BUCKET = "el-profesor-pdfs";
