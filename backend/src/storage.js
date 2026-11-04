/** Receipt photos in the private Supabase Storage bucket "receipts" (PRD M3). */
export function supabaseStorage(supabase) {
  const bucket = () => supabase.storage.from('receipts');
  return {
    async upload(path, buffer, contentType) {
      const { error } = await bucket().upload(path, buffer, { contentType, upsert: false });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error(`Photo removal failed: ${error.message}`);
    },
    async signedUrl(path, seconds = 600) {
      const { data, error } = await bucket().createSignedUrl(path, seconds);
      if (error) throw new Error(`Signed URL failed: ${error.message}`);
      return data.signedUrl;
    },
    /** Everything under a folder (a payer's photos live under their id). */
    async removeFolder(folder) {
      const { data, error } = await bucket().list(folder, { limit: 1000 });
      if (error) throw new Error(`Photo listing failed: ${error.message}`);
      await this.remove(data.map((f) => `${folder}/${f.name}`));
    },
    /** Several at once: one request to Storage instead of one per photo. */
    async signedUrls(paths, seconds = 600) {
      if (paths.length === 0) return [];
      const { data, error } = await bucket().createSignedUrls(paths, seconds);
      if (error) throw new Error(`Signed URLs failed: ${error.message}`);
      return data.map((d) => d.signedUrl ?? null);
    },
  };
}
