'use client';

import { supportedImageTypes, supportedTypes, supportedVideoTypes } from '@/constants/mimeTypes';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Link2, UploadCloud } from 'react-feather';
import imageCompression from 'browser-image-compression';
import styles from '../main.module.scss';
import u from './Upload.module.scss';
import { api } from '@/util/api';
import { cropFile } from '@/util/cropImage';
import type { Box } from '@/util/imageEdges';
import CropEditor from './CropEditor';
import DuplicateWarning from './DuplicateWarning';
import { findLookalikes } from './duplicateCheck';
import type { ThumbMeme } from '@/components/MemeThumbStrip';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatType(type: string) {
  return (type.split('/')[1] ?? type).toUpperCase().replace('JPEG', 'JPG');
}

// Pick (drop, paste, browse, or import from a post link) -> preview and crop -> upload -> done.
export default function UploadComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // The crop chosen in the preview, as fractions of the image. Null means the whole image.
  const [crop, setCrop] = useState<Box | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  // The meme just uploaded: switches the page to the done state.
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The post link field, and the post the selected file was imported from (sent with the
  // upload so the meme remembers it).
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  // Set when that post was already imported: the existing meme's slug.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Memes the picked file looks like (the duplicate check). Kept with the file it was for,
  // so a slow answer about a file since replaced is never shown.
  const [lookalikes, setLookalikes] = useState<{ file: File; memes: ThumbMeme[] } | null>(null);
  const hasLookalikes = !!file && lookalikes?.file === file && lookalikes.memes.length > 0;

  const isImage = !!file && supportedImageTypes.includes(file.type);
  const isVideo = !!file && supportedVideoTypes.includes(file.type);
  const isGif = file?.type === 'image/gif';

  const selectFile = (next: File) => {
    setError('');
    setNote('');
    setUploadedId(null);
    setSourceUrl(null);
    setDuplicate(null);
    if (!supportedTypes.includes(next.type)) {
      setError(
        `${next.type ? formatType(next.type) : 'That file'} isn't supported. Use PNG, JPG, GIF, WebP, MP4 or WebM.`
      );
      return;
    }
    setFile(next);
    setCrop(null);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(next);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCrop(null);
    setError('');
    setNote('');
    setSourceUrl(null);
    setDuplicate(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Fetches a post's media on the server and selects it as if it had been picked. The
  // server answers with JSON instead of a file when the post was imported before.
  const importLink = async (url: string, force = false) => {
    if (!url.trim() || importing) {
      return;
    }
    setError('');
    setDuplicate(null);
    setImporting(true);
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, force }),
      });
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const data = (await response.json()) as { error?: string; duplicate?: string };
        if (data.duplicate) {
          setDuplicate(data.duplicate);
        } else {
          setError(data.error ?? `The import failed (${response.status}).`);
        }
        return;
      }
      const blob = await response.blob();
      const name = response.headers.get('X-File-Name') ?? 'import';
      const source = response.headers.get('X-Source-Url');
      selectFile(new File([blob], name, { type: blob.type }));
      setSourceUrl(source);
      setLink('');
      setNote(`Imported from ${source ? new URL(source).hostname.replace(/^www\./, '') : 'a link'}. Check it over, then upload.`);
    } catch {
      setError('The import failed. Try again.');
    } finally {
      setImporting(false);
    }
  };

  // Paste anywhere on the page: the fastest path from a screenshot to the cache. A pasted
  // post link (outside a text field) starts an import.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])][0];
      if (pasted) {
        event.preventDefault();
        selectFile(pasted);
        return;
      }
      const text = event.clipboardData?.getData('text').trim() ?? '';
      const inField = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (!file && !inField && /^https?:\/\/\S+$/.test(text)) {
        event.preventDefault();
        setLink(text);
        importLink(text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Shared from another app on Android: public/sw.js parked the file in Cache Storage and
  // sent us here with ?shared=1. Take it out once and preselect it.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('shared') || !('caches' in window)) {
      return;
    }
    (async () => {
      const cache = await caches.open('share-target');
      const response = await cache.match('/shared-file');
      if (!response) {
        return;
      }
      await cache.delete('/shared-file');
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('X-File-Name') ?? 'shared');
      selectFile(new File([blob], name, { type: blob.type }));
      setNote('Shared from another app. Check it over, then upload.');
    })().catch((err) => console.error('Could not read the shared file:', err));
    // selectFile only sets state, so running this once on mount is enough.
  }, []);

  // Checks each picked file for look-alikes while it is being looked over.
  useEffect(() => {
    if (!file) {
      return;
    }
    let current = true;
    findLookalikes(file).then((memes) => {
      if (current) {
        setLookalikes({ file, memes });
      }
    });
    return () => {
      current = false;
    };
  }, [file]);

  const handleUpload = async () => {
    if (!file) {
      return;
    }
    setError('');
    setUploading(true);

    try {
      let fileToUpload: File = file;

      if (isImage && !isGif) {
        if (crop) {
          fileToUpload = await cropFile(file, crop);
        }
        // Downscale past 1920px and recompress at full quality.
        try {
          fileToUpload = await imageCompression(fileToUpload, {
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            initialQuality: 1,
          });
        } catch (err) {
          console.error('Image compression failed, uploading the original:', err);
        }
      }

      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (fileToUpload.size > limit) {
        setError(
          `That's ${formatSize(fileToUpload.size)}. The limit for ${
            isVideo ? 'videos' : 'images'
          } is ${formatSize(limit)}.`
        );
        return;
      }

      const formData = new FormData();
      // No user id here on purpose: the server takes the uploader from the session.
      formData.append('file', fileToUpload);
      if (sourceUrl) {
        formData.append('sourceUrl', sourceUrl);
      }
      const result = await api<{ id: string; slug: string }>('/api/upload', { body: formData });
      reset();
      setUploadedId(result.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div className={u.upload}>
      <input
        ref={inputRef}
        type="file"
        accept={supportedTypes.join(',')}
        className={u.hiddenInput}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) {
            selectFile(picked);
          }
        }}
      />

      {uploadedId && (
        <div className={u.card}>
          <div className={u.done}>
            <CheckCircle size={28} />
            <div>
              <div className={u.doneTitle}>Uploaded</div>
              <div className={u.muted}>It&apos;s in Explore and on your profile.</div>
            </div>
          </div>
          <div className={u.actions}>
            <button
              type="button"
              className={`${styles['button']} ${styles['button-secondary']}`}
              onClick={() => {
                setUploadedId(null);
                openPicker();
              }}
            >
              Upload another
            </button>
            <Link href={`/meme/${uploadedId}`} className={styles['button']}>
              View it
            </Link>
          </div>
        </div>
      )}

      {!file && !uploadedId && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Choose a meme to upload"
          className={`${u.dropzone} ${dragging ? u.dragging : ''}`}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) {
              selectFile(dropped);
            }
          }}
        >
          <UploadCloud size={36} className={u.dropIcon} />
          <div className={u.dropTitle}>{dragging ? 'Drop it' : 'Drop a meme here'}</div>
          <div className={u.muted}>
            or <span className={u.linkish}>browse</span>, or paste with Ctrl+V
          </div>
          <div className={u.hint}>
            PNG, JPG, GIF or WebP up to 4 MB. MP4 or WebM up to 30 MB.
          </div>
        </div>
      )}

      {file && preview && (
        <div className={u.card}>
          <div className={u.fileRow}>
            <div className={u.fileInfo}>
              <div className={u.fileName}>{file.name}</div>
              <div className={u.muted}>
                {formatType(file.type)} · {formatSize(file.size)}
                {crop && ' · cropped'}
              </div>
            </div>
            <button
              type="button"
              className={`${styles['button']} ${styles['button-secondary']} ${styles['button-small']}`}
              onClick={openPicker}
              disabled={uploading}
            >
              Change
            </button>
          </div>

          {note && <div className={u.note}>{note}</div>}

          {hasLookalikes && <DuplicateWarning memes={lookalikes.memes} />}

          <div className={u.previewArea}>
            {isImage && !isGif && (
              // key: a new file starts with a fresh crop box and a fresh edge analysis.
              <CropEditor key={preview} src={preview} onChange={setCrop} />
            )}
            {isGif && (
              <>
                <div className={u.muted}>
                  GIFs upload as they are. Cropping would keep only the first frame.
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Preview of the selected GIF" className={u.media} />
              </>
            )}
            {isVideo && <video src={preview} controls className={u.media} />}
          </div>

          <div className={u.footer}>
            <div className={u.error} role="alert">
              {error}
            </div>
            <div className={u.actions}>
              <button
                type="button"
                className={`${styles['button']} ${styles['button-secondary']}`}
                onClick={reset}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles['button']}
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : hasLookalikes ? 'Upload anyway' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!file && !uploadedId && (
        <form
          className={u.importRow}
          onSubmit={(e) => {
            e.preventDefault();
            importLink(link);
          }}
        >
          <Link2 size={16} className={u.importIcon} aria-hidden="true" />
          <input
            type="url"
            inputMode="url"
            placeholder="Or paste a link from X, Instagram, TikTok, YouTube or Reddit"
            aria-label="Post link to import"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setDuplicate(null);
            }}
            className={u.importInput}
            disabled={importing}
          />
          <button
            type="submit"
            className={`${styles['button']} ${styles['button-small']}`}
            disabled={importing || !link.trim()}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </form>
      )}

      {duplicate && !file && (
        <div className={u.note}>
          That post is already here.{' '}
          <Link href={`/meme/${duplicate}`} className={u.linkish}>
            View it
          </Link>{' '}
          or{' '}
          <button type="button" className={u.textButton} onClick={() => importLink(link, true)}>
            import it again
          </button>
          .
        </div>
      )}

      {/* Errors from picking a file show under the drop zone. */}
      {!file && error && (
        <div className={u.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
