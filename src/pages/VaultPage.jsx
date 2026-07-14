import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Plus, Search, Eye, EyeOff, Copy, Check, Trash2, ShieldCheck, Clock, ExternalLink, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// ── API 工具 ────────────────────────────────────────────────
function getAuthHeaders(json = false) {
  const headers = {};
  try {
    const token = localStorage.getItem('ai_buddy_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function api(path, options = {}) {
  const opts = {
    credentials: 'include',
    ...options,
    headers: { ...getAuthHeaders(!!options.body), ...(options.headers || {}) },
  };
  if (options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    try { localStorage.removeItem('ai_buddy_token'); } catch {}
    window.location.hash = '#/login';
    return { data: null, error: { message: '未登录' } };
  }
  return res.json();
}

const CATEGORIES = [
  { value: 'password', label: '账号密码' },
  { value: 'apikey', label: 'API Key' },
  { value: 'card', label: '银行卡' },
  { value: 'note', label: '敏感备忘' },
];

function getCategoryLabel(v) { return CATEGORIES.find(c => c.value === v)?.label || v; }

const VAULT_TOKEN_KEY = 'ai_buddy_vault_token';
const VAULT_EXPIRES_KEY = 'ai_buddy_vault_expires';

function getVaultToken() {
  try { return localStorage.getItem(VAULT_TOKEN_KEY); } catch { return null; }
}
function getVaultExpiry() {
  try { return parseInt(localStorage.getItem(VAULT_EXPIRES_KEY) || '0', 10); } catch { return 0; }
}
function setVaultData(token, expiresIn) {
  const expires = Date.now() + expiresIn * 1000;
  localStorage.setItem(VAULT_TOKEN_KEY, token);
  localStorage.setItem(VAULT_EXPIRES_KEY, String(expires));
}
function clearVaultData() {
  localStorage.removeItem(VAULT_TOKEN_KEY);
  localStorage.removeItem(VAULT_EXPIRES_KEY);
}

// ── 解锁弹窗 ────────────────────────────────────────────────
function UnlockDialog({ open, onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!password) { toast.error('请输入密码'); return; }
    setLoading(true);
    const r = await api('/api/vault/unlock', { method: 'POST', body: { password } });
    setLoading(false);
    if (r.error) { toast.error(r.error.message); return; }
    setVaultData(r.data.vault_token, r.data.expires_in);
    toast.success('已解锁，1小时内免密');
    setPassword('');
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> 解锁保险箱
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-gray-500">请输入登录密码验证身份，解锁后 1 小时内无需再次输入。</p>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="登录密码" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleUnlock} disabled={loading} className="bg-[#bbea3b] hover:bg-[#a8d435] text-black">
            {loading ? '解锁中...' : '解锁'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 条目表单 ────────────────────────────────────────────────
function ItemFormDialog({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState({
    category: 'password', title: '', username: '', secret: '', url: '', notes: '', is_active: true,
  });

  useEffect(() => {
    if (open) {
      setForm(initial || {
        category: 'password', title: '', username: '', secret: '', url: '', notes: '', is_active: true,
      });
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return; }
    if (!form.secret.trim()) { toast.error('请填写密码/密钥'); return; }
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑条目' : '新增条目'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto py-2">
          <div className="flex gap-3">
            <div className="w-36">
              <label className="text-xs text-gray-500 mb-1 block">分类</label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">标题 *</label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：GitHub 账号" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">用户名 / 邮箱 / 手机号</label>
            <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="如：user@example.com" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">密码 / 密钥 *</label>
            <Input value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="明文密码，保存后加密存储" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">关联网址</label>
            <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注</label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="加密存储的补充信息" />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant={form.is_active ? 'default' : 'outline'} size="sm"
              onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={form.is_active ? 'bg-green-500 hover:bg-green-600 text-white' : ''}>
              <Power className="w-3 h-3 mr-1" /> {form.is_active ? '使用中' : '已废弃'}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} className="bg-[#bbea3b] hover:bg-[#a8d435] text-black">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════════════
const VaultPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [unlockDialog, setUnlockDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState({ open: false, initial: null });
  const [deleteTarget, setDeleteTarget] = useState(null);
  // 明文缓存：item id → { secret, notes, revealed }
  const [revealed, setRevealed] = useState({});
  const [showSecret, setShowSecret] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const timerRef = useRef(null);

  // 检查解锁状态
  useEffect(() => {
    const token = getVaultToken();
    const expires = getVaultExpiry();
    if (token && expires > Date.now()) {
      setUnlocked(true);
      setRemainingSec(Math.floor((expires - Date.now()) / 1000));
    } else {
      clearVaultData();
      setUnlockDialog(true);
    }
  }, []);

  // 倒计时
  useEffect(() => {
    if (!unlocked) return;
    timerRef.current = setInterval(() => {
      setRemainingSec(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          clearVaultData();
          setUnlocked(false);
          setRevealed({});
          setUnlockDialog(true);
          toast.warning('保险箱已自动锁定，请重新解锁');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [unlocked]);

  const loadItems = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (keyword) params.set('keyword', keyword);
    params.set('is_active', showInactive ? 'all' : 'true');
    const r = await api(`/api/vault/items?${params}`);
    if (r.data) setItems(r.data);
    else if (r.error) toast.error(r.error.message);
    setLoading(false);
  }, [unlocked, category, keyword, showInactive]);

  useEffect(() => { if (unlocked) loadItems(); }, [loadItems, unlocked]);

  const revealSecret = async (id) => {
    if (revealed[id]) return;
    const r = await api(`/api/vault/items/${id}`, { headers: { 'X-Vault-Token': getVaultToken() } });
    if (r.error) {
      if (r.error.message?.includes('过期') || r.error.message?.includes('未解锁')) {
        clearVaultData();
        setUnlocked(false);
        setUnlockDialog(true);
      }
      toast.error(r.error.message);
      return;
    }
    setRevealed(prev => ({ ...prev, [id]: { secret: r.data.secret, notes: r.data.notes } }));
  };

  const copySecret = async (id) => {
    await revealSecret(id);
    const data = revealed[id];
    if (data) {
      try {
        await navigator.clipboard.writeText(data.secret);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
        toast.success('已复制到剪贴板');
      } catch { toast.error('复制失败'); }
    }
  };

  const saveItem = async (form) => {
    const isNew = !itemDialog.initial;
    const r = isNew
      ? await api('/api/vault/items', { method: 'POST', body: form })
      : await api(`/api/vault/items/${itemDialog.initial.id}`, { method: 'PATCH', body: form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '已创建' : '已保存');
    setItemDialog({ open: false, initial: null });
    loadItems();
  };

  const toggleActive = async (item) => {
    const r = await api(`/api/vault/items/${item.id}`, { method: 'PATCH', body: { is_active: !item.is_active } });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(item.is_active ? '已标记废弃' : '已恢复使用');
    loadItems();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const r = await api(`/api/vault/items/${deleteTarget.id}`, { method: 'DELETE' });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success('已删除');
    setDeleteTarget(null);
    loadItems();
  };

  const lockNow = () => {
    clearVaultData();
    setUnlocked(false);
    setRevealed({});
    setRemainingSec(0);
    setUnlockDialog(true);
    toast.info('已手动锁定');
  };

  const formatRemaining = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // 未解锁时只显示锁屏
  if (!unlocked) {
    return (
      <>
        <div className="h-full flex flex-col items-center justify-center bg-[#f5f5f5]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Lock className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">保险箱已锁定</p>
              <p className="text-xs text-gray-400 mt-1">输入登录密码解锁，1小时内免密</p>
            </div>
            <Button className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setUnlockDialog(true)}>
              <Lock className="w-4 h-4 mr-1" /> 解锁
            </Button>
          </div>
        </div>
        <UnlockDialog
          open={unlockDialog}
          onClose={() => setUnlockDialog(false)}
          onSuccess={() => { setUnlocked(true); setRemainingSec(3600); }}
        />
      </>
    );
  }

  // 已解锁：主界面
  return (
    <div className="h-full flex flex-col bg-[#f5f5f5]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-green-500" />
          <h1 className="text-base font-semibold">密码保险箱</h1>
          <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs">
            <Clock className="w-3 h-3" /> {formatRemaining(remainingSec)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={lockNow} className="text-xs">
            <Lock className="w-3 h-3 mr-1" /> 锁定
          </Button>
          <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setItemDialog({ open: true, initial: null })}>
            <Plus className="w-4 h-4 mr-1" /> 新增
          </Button>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-gray-100">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索标题/用户名" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={showInactive ? 'default' : 'outline'} onClick={() => setShowInactive(!showInactive)} className="h-8 text-xs">
          {showInactive ? '含废弃' : '仅使用中'}
        </Button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-gray-400">
            <Lock className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm mb-3">还没有保存任何条目</p>
            <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setItemDialog({ open: true, initial: null })}>
              <Plus className="w-4 h-4 mr-1" /> 添加第一个条目
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const data = revealed[item.id];
              const isCopied = copiedId === item.id;
              return (
                <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{getCategoryLabel(item.category)}</Badge>
                        <span className="text-sm font-medium truncate">{item.title}</span>
                        {item.is_active
                          ? <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          : <Badge variant="secondary" className="text-xs text-gray-400">废弃</Badge>}
                      </div>
                      {item.username && <div className="text-xs text-gray-500 mt-0.5">{item.username}</div>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-0.5 inline-flex items-center gap-0.5">
                          {item.url.replace(/^https?:\/\//, '').slice(0, 40)} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {/* 密码显示区 */}
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-xs bg-gray-50 px-2 py-0.5 rounded font-mono">
                          {data ? (showSecret[item.id] ? data.secret : '••••••••') : '••••••••'}
                        </code>
                        <button onClick={() => { revealSecret(item.id); setShowSecret(s => ({ ...s, [item.id]: !s[item.id] })); }}
                          className="text-gray-400 hover:text-gray-600 transition-colors">
                          {showSecret[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copySecret(item.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {data?.notes && <div className="text-xs text-gray-400 mt-1">{data.notes}</div>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(item)} className="h-7 px-2 text-xs" title={item.is_active ? '标记废弃' : '恢复使用'}>
                        <Power className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setItemDialog({ open: true, initial: item })} className="h-7 px-2 text-xs">编辑</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item)} className="h-7 px-2 text-xs text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UnlockDialog
        open={unlockDialog}
        onClose={() => setUnlockDialog(false)}
        onSuccess={() => { setUnlocked(true); setRemainingSec(3600); }}
      />
      <ItemFormDialog
        open={itemDialog.open}
        onClose={() => setItemDialog({ open: false, initial: null })}
        onSubmit={saveItem}
        initial={itemDialog.initial}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除「{deleteTarget?.title}」？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VaultPage;
