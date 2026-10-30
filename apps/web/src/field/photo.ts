/** Shrinks a camera photo so it fits in the offline queue and uploads on a weak connection. */
export async function compressPhoto(file: File, maxSide = 1600, quality = 0.7): Promise<{ name: string; type: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg', dataUrl };
}
