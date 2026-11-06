
import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import { supabase } from './lib/supabase';
import {
  Folder as FolderIcon, FolderPlus, File as FileIcon, Upload, Download,
  Eye, Pencil, Trash2, Share2, ArrowLeft, Search, X, Users, UserRound,
} from 'lucide-react';

type Folder = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  folder_name: string;
};

type Doc = {
  id: string;
  folder_id: string;
  owner_id: string;
  file_name: string;
  storage_path: string;
  file_type: string | null;
  file_size: number | null;
};

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Props = {
  userId: string;
  role: string;
};

const ROOT = '__SAFEBOX_ROOT__';
const BUCKET = 'documents';

export default function Workspace({ userId, role }: Props) {
  const admin = role === 'super_admin';

  const [members, setMembers] = useState<Member[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Doc[]>([]);
  const [shared, setShared] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<Doc | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [shareTarget, setShareTarget] = useState<Doc | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [uploadKey, setUploadKey] = useState(0);

  const ownerId = admin ? member?.id ?? '' : userId;

  function notify(error: unknown) {
    console.error('SafeBox error:', error);

    if (error instanceof Error) {
      setMessage(error.message || 'Something went wrong. Check the browser console.');
      return;
    }

    if (error && typeof error === 'object') {
      const details = error as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      const errorMessage = [
        details.message,
        details.details,
        details.hint ? `Hint: ${details.hint}` : '',
        details.code ? `Code: ${details.code}` : '',
      ].filter(Boolean).join(' | ');

      setMessage(errorMessage || 'Something went wrong. Check the browser console.');
      return;
    }

    setMessage(typeof error === 'string' ? error : 'Something went wrong.');
  }

  // FIXED: Handles duplicate root records safely.
  async function getRoot(id: string): Promise<Folder | null> {
    if (!id) return null;

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('owner_id', id)
      .eq('folder_name', ROOT)
      .is('parent_id', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) return data as Folder;

    if (admin) return null;

    const { data: newRoot, error: createError } = await supabase
      .from('folders')
      .insert({
        owner_id: id,
        parent_id: null,
        folder_name: ROOT,
      })
      .select('*')
      .single();

    if (createError) throw createError;

    return newRoot as Folder;
  }

  async function loadMembers() {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,email')
        .eq('role', 'member')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;

      setMembers((data ?? []) as Member[]);
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadShared() {
    if (admin || current) {
      setShared([]);
      return;
    }

    const { data: shares, error } = await supabase
      .from('document_shares')
      .select('document_id')
      .eq('shared_with', userId);

    if (error) {
      setShared([]);
      return;
    }

    const ids = (shares ?? []).map((s) => s.document_id);

    if (!ids.length) {
      setShared([]);
      return;
    }

    const { data, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (docsError) {
      notify(docsError);
    } else {
      setShared((data ?? []) as Doc[]);
    }
  }

  async function loadWorkspace() {
    if (admin && !member) {
      await loadMembers();
      setFolders([]);
      setFiles([]);
      setShared([]);
      return;
    }

    if (!ownerId) return;

    setLoading(true);
    setMessage('');

    try {
      const root = await getRoot(ownerId);

      let folderQuery = supabase
        .from('folders')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      folderQuery = current
        ? folderQuery.eq('parent_id', current.id)
        : folderQuery.is('parent_id', null);

      const { data: folderData, error: folderError } = await folderQuery;

      if (folderError) throw folderError;

      setFolders(
        (folderData ?? []).filter(
          (folder: Folder) => folder.folder_name !== ROOT
        )
      );

      if (!current && !root) {
        setFiles([]);
      } else {
        const folderId = current?.id ?? root!.id;

        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('owner_id', ownerId)
          .eq('folder_id', folderId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setFiles((data ?? []) as Doc[]);
      }

      await loadShared();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (admin && !member) {
      loadMembers();
    } else {
      loadWorkspace();
    }
  }, [userId, role, member, current]);

  function openMember(selectedMember: Member) {
    setMember(selectedMember);
    setCurrent(null);
    setSearch('');
    setMessage('');
  }

  function back() {
    if (current) {
      setCurrent(null);
    } else if (admin) {
      setMember(null);
    }

    setSearch('');
    setMessage('');
  }

  async function createFolder(e: FormEvent) {
    e.preventDefault();

    const name = folderName.trim();

    if (!name) {
      setMessage('Please enter a folder name.');
      return;
    }

    if (name === ROOT) {
      setMessage('That folder name is reserved. Please choose another name.');
      return;
    }

    if (!ownerId) {
      setMessage('Select a member before creating a folder.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase
        .from('folders')
        .insert({
          owner_id: ownerId,
          parent_id: current?.id ?? null,
          folder_name: name,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (!data?.id) {
        throw new Error('The folder was not created. Supabase returned no folder ID.');
      }

      setFolderName('');
      setMessage('Folder created successfully.');

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);

    if (!selected.length || admin) return;

    setLoading(true);
    setMessage('');

    try {
      const destination = current ?? await getRoot(userId);

      if (!destination) {
        throw new Error('Could not find your upload folder.');
      }

      for (const file of selected) {
        const safe = file.name.replace(/[^\w.-]/g, '_');
        const path = `${userId}/${destination.id}/${Date.now()}_${safe}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { error } = await supabase
          .from('documents')
          .insert({
            folder_id: destination.id,
            owner_id: userId,
            file_name: file.name,
            storage_path: path,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
          });

        if (error) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw error;
        }
      }

      setMessage(`${selected.length} file(s) uploaded successfully.`);
      setUploadKey((key) => key + 1);

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function signedUrl(file: Doc) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, 3600);

    if (error) throw error;

    return data.signedUrl;
  }

  async function downloadFile(file: Doc) {
    try {
      const url = await signedUrl(file);

      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    } catch (error) {
      notify(error);
    }
  }

  async function previewFile(file: Doc) {
    setPreview(file);
    setPreviewUrl('');
    setPreviewText('');

    try {
      const url = await signedUrl(file);

      setPreviewUrl(url);

      const type = file.file_type ?? '';
      const name = file.file_name.toLowerCase();

      if (
        type.startsWith('text/') ||
        name.endsWith('.txt') ||
        name.endsWith('.csv')
      ) {
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error('Could not load file preview.');
        }

        setPreviewText(await response.text());
      }
    } catch (error) {
      notify(error);
      setPreview(null);
    }
  }

  async function renameFile(file: Doc) {
    const name = window
      .prompt('Enter the new file name:', file.file_name)
      ?.trim();

    if (!name || name === file.file_name) return;

    const safe = name.replace(/[^\w.-]/g, '_');
    const newPath = `${file.owner_id}/${file.folder_id}/${Date.now()}_${safe}`;

    setLoading(true);

    try {
      const { error: moveError } = await supabase.storage
        .from(BUCKET)
        .move(file.storage_path, newPath);

      if (moveError) throw moveError;

      const { error } = await supabase
        .from('documents')
        .update({
          file_name: name,
          storage_path: newPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', file.id);

      if (error) {
        // Try to move the object back if the metadata update fails.
        await supabase.storage.from(BUCKET).move(newPath, file.storage_path);
        throw error;
      }

      setMessage('File renamed successfully.');

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteFile(file: Doc) {
    if (!window.confirm(`Permanently delete "${file.file_name}"?`)) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', file.id);

      if (error) throw error;

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([file.storage_path]);

      if (storageError) {
        notify(
          new Error(
            'File record deleted, but the storage object could not be removed: ' +
            storageError.message
          )
        );
      } else {
        setMessage('File deleted successfully.');
      }

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  function shareFile(file: Doc) {
    setShareTarget(file);
    setShareEmail('');
  }

  async function submitShare(e: FormEvent) {
    e.preventDefault();

    if (!shareTarget || !shareEmail.trim()) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        'find_member_for_sharing',
        {
          p_email: shareEmail.trim(),
        }
      );

      if (error) throw error;

      const recipient = Array.isArray(data) ? data[0] : data;

      if (!recipient) {
        throw new Error('No active registered member found with that email.');
      }

      if (recipient.id === shareTarget.owner_id) {
        throw new Error('This is the file owner account.');
      }

      const { data: existing, error: checkError } = await supabase
        .from('document_shares')
        .select('id')
        .eq('document_id', shareTarget.id)
        .eq('shared_with', recipient.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        throw new Error('This file is already shared with that member.');
      }

      const { error: insertError } = await supabase
        .from('document_shares')
        .insert({
          document_id: shareTarget.id,
          shared_by: userId,
          shared_with: recipient.id,
          permission: 'view',
        });

      if (insertError) throw insertError;

      setMessage(`Shared with ${recipient.full_name || recipient.email}.`);
      setShareTarget(null);
      setShareEmail('');
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function renameFolder(folder: Folder) {
    const name = window
      .prompt('Enter new folder name:', folder.folder_name)
      ?.trim();

    if (!name || name === folder.folder_name) return;

    if (name === ROOT) {
      setMessage('That folder name is reserved.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('folders')
        .update({
          folder_name: name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', folder.id);

      if (error) throw error;

      setMessage('Folder renamed successfully.');

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteFolder(folder: Folder) {
    if (!window.confirm(`Delete folder "${folder.folder_name}"?`)) return;

    setLoading(true);

    try {
      const { count: childCount, error: childError } = await supabase
        .from('folders')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', folder.id);

      if (childError) throw childError;

      const { count: fileCount, error: fileError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('folder_id', folder.id);

      if (fileError) throw fileError;

      if ((childCount ?? 0) > 0 || (fileCount ?? 0) > 0) {
        throw new Error('Folder is not empty. Delete its contents first.');
      }

      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folder.id);

      if (error) throw error;

      setMessage('Folder deleted successfully.');

      await loadWorkspace();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMember(m: Member) {
    const ok = window.confirm(
      `Permanently delete ${m.full_name || m.email} and all their SafeBox files and folders? This cannot be undone.`
    );

    if (!ok) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        'admin-delete-member',
        {
          body: { memberId: m.id },
        }
      );

      if (error) throw error;

      if (data?.error) throw new Error(data.error);

      setMessage('Member and their SafeBox data deleted successfully.');
      setMember(null);

      await loadMembers();
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }

  function size(bytes: number | null) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  const visibleMembers = members.filter((m) =>
    `${m.full_name ?? ''} ${m.email ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const visibleFolders = folders.filter((f) =>
    f.folder_name.toLowerCase().includes(search.toLowerCase())
  );

  const visibleFiles = files.filter((f) =>
    f.file_name.toLowerCase().includes(search.toLowerCase())
  );

  if (admin && !member) {
    return (
      <section className="workspace-area">
        <div className="workspace-heading">
          <div>
            <h2>Member Management</h2>
            <p>Manage every member and their SafeBox files.</p>
          </div>

          <span className="action-button">
            <Users size={17} /> {members.length} Members
          </span>
        </div>

        <div className="file-toolbar">
          <div className="file-search">
            <Search size={16} />
            <input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {message && <p className="workspace-message">{message}</p>}

        {loading ? (
          <p>Loading members...</p>
        ) : (
          <div className="folder-grid">
            {visibleMembers.map((m) => (
              <div className="folder-card" key={m.id}>
                <div className="folder-icon">
                  <UserRound size={27} />
                </div>

                <div className="folder-details">
                  <h4>{m.full_name || 'Unnamed Member'}</h4>
                  <small>{m.email}</small>
                </div>

                <div className="file-actions">
                  <button
                    className="file-action"
                    onClick={() => openMember(m)}
                  >
                    View Files
                  </button>

                  <button
                    className="file-action"
                    title="Delete member"
                    onClick={() => deleteMember(m)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !visibleMembers.length && (
          <p className="muted">No members found.</p>
        )}
      </section>
    );
  }

  const type = preview?.file_type ?? '';
  const lowerName = preview?.file_name.toLowerCase() ?? '';

  return (
    <section className="workspace-area">
      <div className="workspace-heading">
        <div>
          <h2>
            {current?.folder_name ||
              (admin ? member?.full_name : 'My Files')}
          </h2>
          <p>
            {admin
              ? member?.email
              : 'Your personal cloud storage'}
          </p>
        </div>

        <button className="back-button" onClick={back}>
          <ArrowLeft size={16} />
          {current
            ? 'Back to Folders'
            : admin
              ? 'All Members'
              : 'Back'}
        </button>
      </div>

      <div className="file-toolbar">
        {!admin && (
          <>
            <form
              className="folder-create-form"
              onSubmit={createFolder}
            >
              <input
                placeholder="New folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />

              <button type="submit" disabled={loading}>
                <FolderPlus size={16} />
                Create Folder
              </button>
            </form>

            <label className="action-button">
              <Upload size={16} />
              Upload Files

              <input
                key={uploadKey}
                type="file"
                multiple
                hidden
                disabled={loading}
                onChange={uploadFiles}
              />
            </label>
          </>
        )}

        <div className="file-search">
          <Search size={16} />
          <input
            placeholder="Search files and folders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {message && (
        <p className="workspace-message">{message}</p>
      )}

      {loading && <p>Loading...</p>}

      <div className="folder-list-heading">
        <h3>Folders</h3>
        <span>{visibleFolders.length}</span>
      </div>

      <div className="folder-grid">
        {visibleFolders.map((f) => (
          <div className="folder-card" key={f.id}>
            <div className="folder-icon">
              <FolderIcon size={26} />
            </div>

            <div className="folder-details">
              <h4>{f.folder_name}</h4>
            </div>

            <div className="file-actions">
              <button
                className="file-action"
                onClick={() => setCurrent(f)}
              >
                Open
              </button>

              <button
                className="file-action"
                title="Rename folder"
                onClick={() => renameFolder(f)}
              >
                <Pencil size={15} />
              </button>

              <button
                className="file-action"
                title="Delete folder"
                onClick={() => deleteFolder(f)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!visibleFolders.length && (
        <p className="muted">No folders here.</p>
      )}

      <div className="folder-list-heading">
        <h3>Files</h3>
        <span>{visibleFiles.length}</span>
      </div>

      <div className="file-table">
        {visibleFiles.map((f) => (
          <div className="file-card" key={f.id}>
            <div className="folder-icon">
              <FileIcon size={23} />
            </div>

            <div className="folder-details">
              <h4>{f.file_name}</h4>
              <small>{size(f.file_size)}</small>
            </div>

            <div className="file-actions">
              <button
                className="file-action"
                title="Preview"
                onClick={() => previewFile(f)}
              >
                <Eye size={16} />
              </button>

              <button
                className="file-action"
                title="Download"
                onClick={() => downloadFile(f)}
              >
                <Download size={16} />
              </button>

              {!admin && (
                <>
                  <button
                    className="file-action"
                    title="Share"
                    onClick={() => shareFile(f)}
                  >
                    <Share2 size={16} />
                  </button>

                  <button
                    className="file-action"
                    title="Rename"
                    onClick={() => renameFile(f)}
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    className="file-action"
                    title="Delete"
                    onClick={() => deleteFile(f)}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!visibleFiles.length && (
        <p className="muted">No files in this location.</p>
      )}

      {!admin && !current && (
        <>
          <div className="folder-list-heading">
            <h3>Shared With Me</h3>
            <span>{shared.length}</span>
          </div>

          <div className="file-table">
            {shared.map((f) => (
              <div className="file-card" key={f.id}>
                <div className="folder-icon">
                  <Share2 size={22} />
                </div>

                <div className="folder-details">
                  <h4>{f.file_name}</h4>
                  <small>{size(f.file_size)}</small>
                </div>

                <div className="file-actions">
                  <button
                    className="file-action"
                    onClick={() => previewFile(f)}
                    title="Preview"
                  >
                    <Eye size={16} />
                  </button>

                  <button
                    className="file-action"
                    onClick={() => downloadFile(f)}
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!shared.length && (
            <p className="muted">
              No files shared with you yet.
            </p>
          )}
        </>
      )}

      {shareTarget && (
        <div className="preview-overlay">
          <div className="preview-panel">
            <div className="preview-header">
              <div>
                <h3>Share File</h3>
                <small>{shareTarget.file_name}</small>
              </div>

              <button
                className="file-action"
                onClick={() => setShareTarget(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form
              className="folder-create-form"
              onSubmit={submitShare}
            >
              <label>Registered member email</label>

              <input
                type="email"
                required
                placeholder="Enter member email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />

              <button type="submit" disabled={loading}>
                Share File
              </button>
            </form>

            <p className="muted">
              The recipient will find this file under
              "Shared With Me".
            </p>
          </div>
        </div>
      )}

      {preview && (
        <div className="preview-overlay">
          <div className="preview-panel">
            <div className="preview-header">
              <div>
                <h3>{preview.file_name}</h3>
                <small>{size(preview.file_size)}</small>
              </div>

              <button
                className="file-action"
                onClick={() => setPreview(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <div className="preview-content">
              {type.startsWith('image/') && (
                <img
                  src={previewUrl}
                  alt={preview.file_name}
                />
              )}

              {type === 'application/pdf' && (
                <iframe
                  src={previewUrl}
                  title={preview.file_name}
                  width="100%"
                  height="600"
                />
              )}

              {type.startsWith('video/') && (
                <video
                  src={previewUrl}
                  controls
                  width="100%"
                />
              )}

              {(type.startsWith('text/') ||
                lowerName.endsWith('.txt') ||
                lowerName.endsWith('.csv')) && (
                <pre>
                  {previewText || 'Loading preview...'}
                </pre>
              )}

              {!type.startsWith('image/') &&
                type !== 'application/pdf' &&
                !type.startsWith('video/') &&
                !type.startsWith('text/') &&
                !lowerName.endsWith('.txt') &&
                !lowerName.endsWith('.csv') && (
                  <div className="empty-folders">
                    <FileIcon size={40} />
                    <h3>Preview not available</h3>

                    <button
                      className="action-button"
                      onClick={() => downloadFile(preview)}
                      type="button"
                    >
                      <Download size={16} />
                      Download
                    </button>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
