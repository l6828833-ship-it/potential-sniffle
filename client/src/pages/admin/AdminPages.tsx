// AdminPages — Quizoi Admin
// Full CRUD: create new pages, edit content (HTML), delete custom pages, live preview
import { useState, useEffect } from 'react';
import {
  Save, ExternalLink, FileText, ChevronRight, CheckCircle2,
  Plus, Trash2, AlertTriangle, X, Eye, Code2, Globe,
} from 'lucide-react';
import {
  adminFetchPages,
  adminCreatePage,
  adminUpdatePage,
  adminDeletePage,
  type PageContent,
} from '@/lib/api';
import { toast } from 'sonner';

// ─── Default page slugs that cannot be deleted ────────────────────────────────
// These match the slugs seeded in the migration (no leading slash)
const PROTECTED_SLUGS = new Set(['privacy-policy', 'terms-of-service', 'about', 'contact']);

// ─── Slug helper ─────────────────────────────────────────────────────────────
function toSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Empty new-page form ──────────────────────────────────────────────────────
const emptyNewPage = (): Partial<PageContent> => ({
  title: '',
  slug: '',
  content: '',
});

// ─── View mode toggle ─────────────────────────────────────────────────────────
type ViewMode = 'editor' | 'preview';

export default function AdminPages() {
  const [pages, setPages] = useState<PageContent[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PageContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // New page panel
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<Partial<PageContent>>(emptyNewPage());
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    adminFetchPages()
      .then(setPages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-reset delete confirmation after 4 seconds
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  // ─── Select page ────────────────────────────────────────────────────────────
  const selectPage = (page: PageContent) => {
    setActiveId(page.id);
    setEditForm({ ...page });
    setShowNew(false);
    setViewMode('editor');
    setConfirmDelete(null);
  };

  const updateField = (field: keyof PageContent, value: string) => {
    setEditForm(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  // ─── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      const updated = await adminUpdatePage(editForm.id, editForm);
      setPages(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      setEditForm({ ...updated });
      toast.success(`"${editForm.title}" saved`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Create ──────────────────────────────────────────────────────────────────
  const handleNewTitleChange = (title: string) => {
    setNewForm(f => ({ ...f, title, slug: toSlug(title) }));
  };

  const handleCreate = async () => {
    if (!newForm.title?.trim()) {
      toast.error('Page title is required');
      return;
    }
    if (!newForm.slug?.trim()) {
      toast.error('Slug is required');
      return;
    }
    setCreating(true);
    try {
      const created = await adminCreatePage(newForm);
      const sorted = [...pages, created].sort((a, b) => a.title.localeCompare(b.title));
      setPages(sorted);
      setShowNew(false);
      setNewForm(emptyNewPage());
      selectPage(created);
      toast.success(`Page "${created.title}" created`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setDeleting(true);
    try {
      await adminDeletePage(id);
      const remaining = pages.filter(p => p.id !== id);
      setPages(remaining);
      setConfirmDelete(null);
      if (activeId === id) {
        setActiveId(null);
        setEditForm(null);
      }
      toast.success('Page deleted');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading pages…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 h-full">
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Pages</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Edit your static pages — Privacy Policy, Terms, About, Contact and any custom pages
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setActiveId(null); setEditForm(null); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Page
        </button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* ── Sidebar — Page List ─────────────────────────────────────────── */}
        <div className="w-60 shrink-0 flex flex-col gap-1 overflow-y-auto">
          {pages.map(page => {
            const isProtected = PROTECTED_SLUGS.has(page.slug);
            const isActive = activeId === page.id;
            const isConfirming = confirmDelete === page.id;

            return (
              <div key={page.id} className="group relative">
                <button
                  onClick={() => selectPage(page)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-gray-100 text-foreground hover:border-gray-200 hover:shadow-sm'
                  }`}
                >
                  <FileText
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-white/80' : 'text-muted-foreground'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-foreground'}`}>
                      {page.title}
                    </p>
                    <p className={`text-xs truncate font-mono ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}>
                      {page.slug}
                    </p>
                  </div>
                  {!isProtected && (
                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white/70' : 'text-muted-foreground'}`}
                    />
                  )}
                  {isProtected && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                        isActive ? 'bg-white/20 text-white/80' : 'bg-gray-100 text-muted-foreground'
                      }`}
                      title="Required page"
                    >
                      req
                    </span>
                  )}
                </button>

                {/* Delete button for non-protected pages */}
                {!isProtected && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isConfirming ? (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(page.id); }}
                        disabled={deleting}
                        className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors animate-pulse"
                        title="Click again to confirm"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Sure?
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(page.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isActive
                            ? 'text-white/70 hover:text-white hover:bg-white/20'
                            : 'text-muted-foreground hover:text-red-600 hover:bg-red-50'
                        }`}
                        title="Delete page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="pt-3 border-t border-gray-100 mt-1">
            <p className="text-xs text-muted-foreground px-1">
              Pages marked <span className="bg-gray-100 text-muted-foreground px-1 rounded font-mono">req</span> are required for Google AdSense approval. Keep them up to date.
            </p>
          </div>
        </div>

        {/* ── Main Panel ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* ── New Page Form ─────────────────────────────────────────────── */}
          {showNew && (
            <div className="bg-white rounded-2xl border-2 border-primary/30 shadow-md p-5 space-y-4 h-full overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" />
                  New Page
                </h2>
                <button
                  onClick={() => setShowNew(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Page Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newForm.title || ''}
                    onChange={e => handleNewTitleChange(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-foreground focus:outline-none focus:border-primary/50"
                    placeholder="e.g. Cookie Policy"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Slug <span className="text-red-500">*</span>
                    <span className="font-normal ml-1">(URL path)</span>
                  </label>
                  <input
                    type="text"
                    value={newForm.slug || ''}
                    onChange={e =>
                      setNewForm(f => ({
                        ...f,
                        slug: e.target.value
                          .replace(/^\/+/, '')
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-'),
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
                    placeholder="cookie-policy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Initial Content (HTML)
                </label>
                <textarea
                  value={newForm.content || ''}
                  onChange={e => setNewForm(f => ({ ...f, content: e.target.value }))}
                  rows={10}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground font-mono focus:outline-none focus:border-primary/50 resize-none"
                  placeholder="<h2>Page Title</h2>&#10;<p>Your content here…</p>"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creating ? 'Creating…' : 'Create Page'}
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 text-foreground text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Editor Panel ──────────────────────────────────────────────── */}
          {!showNew && editForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-full overflow-hidden">
              {/* Editor Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                <div>
                  <h2 className="font-display text-base font-semibold text-foreground">{editForm.title}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                      <Globe className="w-3 h-3" />
                      {editForm.slug}
                    </span>
                    {editForm.updatedAt && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          Updated: {new Date(editForm.updatedAt).toLocaleDateString()}
                        </span>
                      </>
                    )}
                    {PROTECTED_SLUGS.has(editForm.slug) && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                        Required for AdSense
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* View mode toggle */}
                  <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => setViewMode('editor')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'editor'
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      HTML
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'preview'
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </button>
                  </div>

                  <a
                    href={editForm.slug.startsWith('/') ? editForm.slug : `/${editForm.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-foreground text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View
                  </a>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Editor Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Title field */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Page Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={e => updateField('title', e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors"
                  />
                </div>

                {/* Slug field */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    URL Slug
                    {PROTECTED_SLUGS.has(editForm.slug) && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">(read-only for required pages)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={editForm.slug}
                    readOnly={PROTECTED_SLUGS.has(editForm.slug)}
                    onChange={e => !PROTECTED_SLUGS.has(editForm.slug) && updateField('slug', e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors ${
                      PROTECTED_SLUGS.has(editForm.slug)
                        ? 'bg-gray-100 border-gray-200 text-muted-foreground cursor-not-allowed'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  />
                </div>

                {/* SEO info */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs text-blue-700">
                    Add your meta title and description inside the HTML content below using{' '}
                    <code className="bg-blue-100 px-1 rounded">&lt;title&gt;</code> and{' '}
                    <code className="bg-blue-100 px-1 rounded">&lt;meta name="description"&gt;</code> tags, or manage them via your hosting provider.
                  </p>
                </div>

                {/* HTML Editor / Preview toggle */}
                {viewMode === 'editor' ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-foreground">Page Content (HTML)</label>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-gray-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        HTML supported
                      </div>
                    </div>
                    <textarea
                      value={editForm.content}
                      onChange={e => updateField('content', e.target.value)}
                      rows={22}
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground font-mono focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors resize-none"
                      placeholder="<h2>Page Title</h2>&#10;<p>Your content here…</p>"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Supported tags: &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;a&gt;, &lt;ul&gt;, &lt;li&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;br&gt;
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      Live Preview
                    </h3>
                    {editForm.content ? (
                      <div
                        className="prose prose-sm max-w-none p-5 bg-gray-50 rounded-xl border border-gray-200 text-foreground min-h-[200px]"
                        dangerouslySetInnerHTML={{ __html: editForm.content }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-sm text-muted-foreground">No content to preview yet.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Empty State ──────────────────────────────────────────────── */}
          {!showNew && !editForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center h-full">
              <div className="text-center px-6">
                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-base font-semibold text-foreground">Select a page to edit</p>
                <p className="text-sm text-muted-foreground mt-1">Choose from the list on the left, or create a new page.</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  New Page
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
