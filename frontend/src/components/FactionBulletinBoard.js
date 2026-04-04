/**
 * FactionBulletinBoard
 * --------------------
 * Faction-scoped pinboard for announcements, strategy notes, and alerts.
 * Backend: /api/bulletin/posts  (bulletin.py)
 *
 * TODO:
 *  - WebSocket: listen for "bulletin_post", "bulletin_delete", "bulletin_pin"
 *    events and update state without a full refetch.
 *  - Category filter: POST categories (announcement | strategy | intel | alert | general)
 *    are defined backend-side; add a filter pill row to narrow the list.
 *  - Pinned section: show pinned posts at the top with a pushpin icon; they come
 *    back from the API with pinned: true.
 *  - Rich text: replace the plain textarea with a minimal markdown editor (e.g.
 *    react-md-editor) and render posts with ReactMarkdown.
 */

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Pin, PinOff, Trash2, Plus, RefreshCw, Send, ChevronDown, ChevronUp,
  AlertTriangle, Megaphone, Map, Info, MessageSquare,
} from 'lucide-react';

const CATEGORY_META = {
  announcement: { label: 'Announcement', icon: <Megaphone className="w-3 h-3" />, color: 'text-[#c4841d] border-[#c4841d]' },
  strategy:     { label: 'Strategy',     icon: <Map className="w-3 h-3" />,       color: 'text-[#6b7a3d] border-[#6b7a3d]' },
  intel:        { label: 'Intel',        icon: <Info className="w-3 h-3" />,       color: 'text-[#3a6b8b] border-[#3a6b8b]' },
  alert:        { label: 'Alert',        icon: <AlertTriangle className="w-3 h-3" />, color: 'text-[#8b3a3a] border-[#8b3a3a]' },
  general:      { label: 'General',      icon: <MessageSquare className="w-3 h-3" />, color: 'text-[#88837a] border-[#88837a]' },
};

function PostCard({ post, currentUser, onPin, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_META[post.category] || CATEGORY_META.general;
  const isAuthor = post.author_id === currentUser?._id;
  const isOfficer = ['leader', 'officer'].includes(currentUser?.faction_role);
  const canDelete = isAuthor || isOfficer;
  const canPin    = isOfficer;
  const preview   = post.content.slice(0, 120);
  const long      = post.content.length > 120;

  return (
    <div className={`border rounded p-3 space-y-1 ${post.pinned ? 'border-[#c4841d]/60 bg-[#c4841d]/5' : 'border-[#3a3832]'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {post.pinned && <Pin className="w-3 h-3 text-[#c4841d]" />}
          <span className={`text-[10px] border rounded px-1 py-0.5 flex items-center gap-1 ${cat.color}`}>
            {cat.icon} {cat.label}
          </span>
          <span className="text-[#c9b89a] text-xs font-medium">{post.title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canPin && (
            <button
              onClick={() => onPin(post.post_id, post.pinned)}
              className="text-[#88837a] hover:text-[#c4841d] transition-colors"
              title={post.pinned ? 'Unpin' : 'Pin'}
            >
              {post.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDelete(post.post_id)}
              className="text-[#88837a] hover:text-[#8b3a3a] transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[#88837a] text-xs leading-relaxed whitespace-pre-wrap">
        {expanded || !long ? post.content : preview + '…'}
      </p>
      {long && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-[#c4841d] flex items-center gap-1"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
        </button>
      )}

      <div className="text-[10px] text-[#4a4540] flex gap-2 pt-1">
        <span>{post.author_callsign}</span>
        <span>·</span>
        <span>{new Date(post.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

function CreatePostForm({ factionId, onCreated, onCancel }) {
  const [title, setTitle]       = useState('');
  const [content, setContent]   = useState('');
  const [category, setCategory] = useState('general');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const submit = async () => {
    if (!title.trim() || !content.trim()) { setError('Title and content are required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/bulletin/posts', { faction_id: factionId, title, content, category });
      onCreated(data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to post');
    } finally { setSaving(false); }
  };

  return (
    <div className="border border-[#3a3832] rounded p-3 space-y-2 bg-[#1a1916]">
      <div className="text-xs text-[#c9b89a] font-medium">New Post</div>

      <input
        className="w-full bg-[#0d0c0a] border border-[#3a3832] rounded px-2 py-1 text-xs text-[#c9b89a] placeholder-[#4a4540] focus:outline-none focus:border-[#c4841d]"
        placeholder="Title…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        maxLength={120}
      />

      <select
        className="w-full bg-[#0d0c0a] border border-[#3a3832] rounded px-2 py-1 text-xs text-[#c9b89a] focus:outline-none"
        value={category}
        onChange={e => setCategory(e.target.value)}
      >
        {Object.entries(CATEGORY_META).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
      </select>

      <textarea
        className="w-full bg-[#0d0c0a] border border-[#3a3832] rounded px-2 py-1 text-xs text-[#c9b89a] placeholder-[#4a4540] focus:outline-none focus:border-[#c4841d] resize-none"
        placeholder="Write your post…"
        rows={4}
        value={content}
        onChange={e => setContent(e.target.value)}
        maxLength={2000}
      />

      {error && <p className="text-[#8b3a3a] text-xs">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs text-[#88837a] hover:text-[#c9b89a] px-2 py-1">Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1 text-xs bg-[#c4841d]/20 border border-[#c4841d]/40 text-[#c4841d] hover:bg-[#c4841d]/30 px-3 py-1 rounded transition-colors disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {saving ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

export default function FactionBulletinBoard({ user, factionId }) {
  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterCat, setFilterCat]   = useState('all');
  const [error, setError]           = useState('');

  const fetchPosts = useCallback(async () => {
    if (!factionId) return;
    setLoading(true);
    try {
      const params = { faction_id: factionId, limit: 50 };
      if (filterCat !== 'all') params.category = filterCat;
      const { data } = await api.get('/bulletin/posts', { params });
      setPosts(data);
    } catch (e) {
      setError('Failed to load posts');
    } finally { setLoading(false); }
  }, [factionId, filterCat]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handlePin = async (postId, currentlyPinned) => {
    try {
      await api.post(`/bulletin/posts/${postId}/pin`, { pinned: !currentlyPinned });
      setPosts(ps => ps.map(p => p.post_id === postId ? { ...p, pinned: !currentlyPinned } : p));
    } catch { /* silent */ }
  };

  const handleDelete = async (postId) => {
    try {
      await api.delete(`/bulletin/posts/${postId}`);
      setPosts(ps => ps.filter(p => p.post_id !== postId));
    } catch { /* silent */ }
  };

  const pinnedPosts  = posts.filter(p => p.pinned);
  const normalPosts  = posts.filter(p => !p.pinned);

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#c4841d] tracking-wider uppercase">Bulletin Board</span>
        <div className="flex items-center gap-2">
          <button onClick={fetchPosts} className="text-[#88837a] hover:text-[#c9b89a]">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(s => !s)}
            className="flex items-center gap-1 text-xs border border-[#c4841d]/40 text-[#c4841d] hover:bg-[#c4841d]/10 px-2 py-1 rounded transition-colors"
          >
            <Plus className="w-3 h-3" /> New Post
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 flex-wrap">
        {['all', ...Object.keys(CATEGORY_META)].map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filterCat === cat
                ? 'border-[#c4841d] text-[#c4841d] bg-[#c4841d]/10'
                : 'border-[#3a3832] text-[#88837a] hover:border-[#4a4540]'
            }`}
          >
            {cat === 'all' ? 'All' : (CATEGORY_META[cat]?.label || cat)}
          </button>
        ))}
      </div>

      {showCreate && (
        <CreatePostForm
          factionId={factionId}
          onCreated={post => { setPosts(ps => [post, ...ps]); setShowCreate(false); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {error && <p className="text-[#8b3a3a] text-xs">{error}</p>}

      <ScrollArea className="flex-1">
        <div className="space-y-3 pr-2">
          {pinnedPosts.length > 0 && (
            <>
              <div className="text-[10px] text-[#c4841d] uppercase tracking-widest flex items-center gap-1">
                <Pin className="w-3 h-3" /> Pinned
              </div>
              {pinnedPosts.map(p => (
                <PostCard key={p.post_id} post={p} currentUser={user} onPin={handlePin} onDelete={handleDelete} />
              ))}
              {normalPosts.length > 0 && <div className="border-t border-[#3a3832]" />}
            </>
          )}

          {normalPosts.map(p => (
            <PostCard key={p.post_id} post={p} currentUser={user} onPin={handlePin} onDelete={handleDelete} />
          ))}

          {posts.length === 0 && !loading && (
            <p className="text-[#4a4540] text-xs text-center py-8">No posts yet. Be the first to post.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
