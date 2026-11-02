/** Receipt photos in the private Supabase Storage bucket "receipts" (PRD M3). */
export function supabaseStorage(supabase) {
  const bucket = () => supabase.storage.from('receipts');
  return {
    async upload(path, buffer, contentType) {
      const { error } = await bucket().upload(path, buffer, { contentType, upsert: false });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
    },
    async signedUrl(path, seconds = 600) {
      const { data, error } = await bucket().createSignedUrl(path, seconds);
      if (error) throw new Error(`Signed URL failed: ${error.message}`);
      return data.signedUrl;
    },
  };
}
