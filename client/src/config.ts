export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const resolveImageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
    const dMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch && dMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${dMatch[1]}`;
    }
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
  }

  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  if (url.startsWith('/')) {
    return url;
  }
  return `/${url}`;
};
