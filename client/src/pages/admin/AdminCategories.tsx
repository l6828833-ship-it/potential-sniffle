// AdminCategories — Quizoi Admin
// Full CRUD: add new categories, edit names/emojis/descriptions/images, delete with confirmation
import { useState, useEffect } from 'react';
import {
  LayoutGrid, Pencil, Save, X, BookOpen, Plus, Trash2,
  AlertTriangle, Search, ImageIcon,
} from 'lucide-react';
import {
  adminFetchCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminFetchQuizzes,
  type Category,
  type Quiz,
} from '@/lib/api';
import { toast } from 'sonner';

// ─── Helper: generate a slug from a name ─────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Empty form state ─────────────────────────────────────────────────────────
const emptyForm = (): Partial<Category> => ({
  name: '',
  slug: '',
  emoji: '',
  description: '',
  imageUrl: '',
});

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allQuizzes, setAllQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Edit state
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Category>>({});

  // Add new category panel
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Category>>(emptyForm());
  const [adding, setAdding] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([adminFetchCategories(), adminFetchQuizzes()])
      .then(([c, q]) => {
        setCategories(c);
        setAllQuizzes(q);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-reset delete confirmation after 4 seconds
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const quizCountForCategory = (catId: string) =>
    allQuizzes.filter(q => q.categoryId === catId).length;

  const publishedCountForCategory = (catId: string) =>
    allQuizzes.filter(q => q.categoryId === catId && q.status === 'PUBLISHED').length;

  // ─── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = (cat: Category) => {
    setEditing(cat.id);
    setEditForm({ ...cat });
    setShowAdd(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm({});
  };

  const saveEdit = async (id: string) => {
    try {
      const updated = await adminUpdateCategory(id, editForm as Partial<Category>);
      setCategories(prev => prev.map(c => c.id === id ? updated : c));
      setEditing(null);
      toast.success('Category updated');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  // ─── Add ───────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setShowAdd(true);
    setEditing(null);
    setAddForm(emptyForm());
  };

  const handleAddNameChange = (name: string) => {
    setAddForm(f => ({
      ...f,
      name,
      slug: toSlug(name),
    }));
  };

  const handleCreate = async () => {
    if (!addForm.name?.trim()) {
      toast.error('Category name is required');
      return;
    }
    if (!addForm.slug?.trim()) {
      toast.error('Slug is required');
      return;
    }
    setAdding(true);
    try {
      const created = await adminCreateCategory(addForm as Category);
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAdd(false);
      setAddForm(emptyForm());
      toast.success(`Category "${created.name}" created`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    const total = quizCountForCategory(id);
    if (total > 0) {
      toast.error(`Cannot delete: ${total} quiz${total !== 1 ? 'zes' : ''} use this category. Reassign them first.`);
      setConfirmDelete(null);
      return;
    }
    setDeleting(true);
    try {
      await adminDeleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
      setConfirmDelete(null);
      toast.success('Category deleted');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading categories…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {categories.length} {categories.length === 1 ? 'category' : 'categories'} · manage names, emojis, descriptions and images
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Category
        </button>
      </div>

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search categories…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Add New Category Panel ──────────────────────────────────────────── */}
      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-primary/30 shadow-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" />
              New Category
            </h2>
            <button
              onClick={() => setShowAdd(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Emoji + Name */}
            <div className="sm:col-span-2 flex items-center gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Emoji</label>
                <input
                  type="text"
                  value={addForm.emoji || ''}
                  onChange={e => setAddForm(f => ({ ...f, emoji: e.target.value }))}
                  className="w-16 text-center px-2 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-lg focus:outline-none focus:border-primary/50"
                  placeholder="🎵"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={addForm.name || ''}
                  onChange={e => handleAddNameChange(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-foreground focus:outline-none focus:border-primary/50"
                  placeholder="e.g. Science & Nature"
                />
              </div>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Slug <span className="text-red-500">*</span>
                <span className="text-muted-foreground font-normal ml-1">(used in URLs)</span>
              </label>
              <input
                type="text"
                value={addForm.slug || ''}
                onChange={e => setAddForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-mono text-foreground focus:outline-none focus:border-primary/50"
                placeholder="science-nature"
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Image URL</span>
              </label>
              <input
                type="text"
                value={(addForm as any).imageUrl || ''}
                onChange={e => setAddForm(f => ({ ...f, imageUrl: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="https://…"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
              <textarea
                value={addForm.description || ''}
                onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description shown on the categories page…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={adding}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {adding ? 'Creating…' : 'Create Category'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 text-foreground text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Categories Grid ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <LayoutGrid className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground">
            {search ? 'No categories match your search' : 'No categories yet'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? 'Try a different keyword.' : 'Click "New Category" to add your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(cat => {
            const isEditing = editing === cat.id;
            const totalCount = quizCountForCategory(cat.id);
            const liveCount = publishedCountForCategory(cat.id);
            const isConfirmingDelete = confirmDelete === cat.id;

            return (
              <div
                key={cat.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
                  isEditing ? 'border-primary/40 ring-2 ring-primary/10' : 'border-gray-100'
                }`}
              >
                {isEditing ? (
                  /* ── Edit Mode ──────────────────────────────────────────── */
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={editForm.emoji || ''}
                        onChange={e => setEditForm(f => ({ ...f, emoji: e.target.value }))}
                        className="w-14 text-center px-2 py-2 rounded-xl bg-gray-50 border border-gray-200 text-lg focus:outline-none focus:border-primary/50"
                        placeholder="🎵"
                      />
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-foreground focus:outline-none focus:border-primary/50"
                        placeholder="Category name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Slug (read-only)</label>
                        <input
                          type="text"
                          value={editForm.slug || ''}
                          readOnly
                          className="w-full px-3 py-2 rounded-xl bg-gray-100 border border-gray-200 text-sm font-mono text-muted-foreground cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Image URL</label>
                        <input
                          type="text"
                          value={(editForm as any).imageUrl || ''}
                          onChange={e => setEditForm(f => ({ ...f, imageUrl: e.target.value }))}
                          placeholder="https://…"
                          className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>
                    <textarea
                      value={editForm.description || ''}
                      onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Short description…"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-foreground focus:outline-none focus:border-primary/50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(cat.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-foreground text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View Mode ──────────────────────────────────────────── */
                  <div className="flex items-start gap-4">
                    {/* Icon / Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 overflow-hidden">
                      {(cat as any).imageUrl ? (
                        <img
                          src={(cat as any).imageUrl}
                          alt={cat.name}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        cat.emoji || <LayoutGrid className="w-5 h-5 text-primary/60" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-base font-semibold text-foreground">{cat.name}</h3>
                        <span className="text-xs text-muted-foreground bg-gray-50 px-2 py-0.5 rounded-full font-mono">
                          {cat.slug}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{cat.description}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <BookOpen className="w-3 h-3" />
                          {liveCount} published · {totalCount} total
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(cat)}
                        className="p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-blue-50 transition-colors"
                        title="Edit category"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      {isConfirmingDelete ? (
                        <button
                          onClick={() => handleDelete(cat.id)}
                          disabled={deleting}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors animate-pulse"
                          title="Click again to confirm deletion"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="p-2 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          title={totalCount > 0 ? `${totalCount} quiz${totalCount !== 1 ? 'zes' : ''} use this category` : 'Delete category'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Info Note ──────────────────────────────────────────────────────── */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <LayoutGrid className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Slugs are fixed after creation</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Category slugs (e.g. <code className="bg-blue-100 px-1 rounded">music</code>, <code className="bg-blue-100 px-1 rounded">sports</code>) are used in quiz data and public URLs — they cannot be changed after creation. You can freely edit the display name, emoji, description, and image. Deleting a category with quizzes assigned to it is blocked until those quizzes are reassigned.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
