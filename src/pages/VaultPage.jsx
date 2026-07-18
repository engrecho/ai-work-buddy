import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Plus, Search, Eye, EyeOff, Copy, Check, Trash2, ShieldCheck, Clock, ExternalLink, CheckSquare, Square, Pencil, Smartphone, Mail, KeyRound, CreditCard, FileLock, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// 登录方式常量
const LOGIN_METHODS = [
  { value: 'phone', label: '手机号登录' },
  { value: 'wechat', label: '微信登录' },
  { value: 'qq', label: 'QQ 登录' },
  { value: 'google', label: '谷歌登录' },
];

function getLoginMethodLabel(v) { return LOGIN_METHODS.find(m => m.value === v)?.label || v; }

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

// 分类视觉映射：色条颜色 + 图标 + 浅色背景
const CATEGORY_STYLES = {
  password: { bar: '#3b82f6', icon: KeyRound, tint: '#eff6ff' },
  apikey:   { bar: '#8b5cf6', icon: KeyRound, tint: '#f5f3ff' },
  card:     { bar: '#f59e0b', icon: CreditCard, tint: '#fffbeb' },
  note:     { bar: '#06b6d4', icon: FileLock, tint: '#ecfeff' },
};
function getCategoryStyle(v) { return CATEGORY_STYLES[v] || CATEGORY_STYLES.password; }

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
      <DialogContent className="w-full max-w-sm mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
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
    category: 'password', title: '', url: '', username: '', phone: '', email: '',
    login_methods: [], secret: '', notes: '', is_active: true,
  });

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        category: initial.category || 'password',
        title: initial.title || '',
        url: initial.url || '',
        username: initial.username || '',
        phone: initial.phone || '',
        email: initial.email || '',
        login_methods: Array.isArray(initial.login_methods) ? initial.login_methods : [],
        secret: initial.secret || '',
        notes: initial.notes || '',
        is_active: initial.is_active !== false && initial.is_active !== 0,
      } : {
        category: 'password', title: '', url: '', username: '', phone: '', email: '',
        login_methods: [], secret: '', notes: '', is_active: true,
      });
    }
  }, [open, initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleLoginMethod = (value) => {
    setForm(f => {
      const list = Array.isArray(f.login_methods) ? f.login_methods : [];
      const has = list.includes(value);
      return { ...f, login_methods: has ? list.filter(v => v !== value) : [...list, value] };
    });
  };

  const handleSubmit = () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return; }
    if (!form.secret.trim()) { toast.error('请填写密码/密钥'); return; }
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑条目' : '新增条目'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* 1. 标题 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">标题 *</label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：GitHub 账号" />
          </div>

          {/* 2. 关联网址 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">关联网址</label>
            <Input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." />
          </div>

          {/* 3. 用户名 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">用户名</label>
            <Input value={form.username} onChange={e => set('username', e.target.value)} placeholder="登录用户名" />
          </div>

          {/* 4. 手机号 + 登录方式 */}
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">手机号</label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="可选" inputMode="tel" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">支持的登录方式（可多选）</label>
              <div className="grid grid-cols-2 gap-2">
                {LOGIN_METHODS.map(m => {
                  const checked = Array.isArray(form.login_methods) && form.login_methods.includes(m.value);
                  return (
                    <button key={m.value} type="button"
                      onClick={() => toggleLoginMethod(m.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                        checked
                          ? 'bg-[#bbea3b]/20 border-[#bbea3b] text-black'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      aria-pressed={checked}
                    >
                      {checked
                        ? <CheckSquare className="w-4 h-4 text-[#7ea82a] flex-shrink-0" />
                        : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. 邮箱 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">邮箱</label>
            <Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="可选" inputMode="email" />
          </div>

          {/* 6. 分类 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">分类</label>
            <Select value={form.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 7. 密码 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">密码 / 密钥 *</label>
            <Input value={form.secret} onChange={e => set('secret', e.target.value)} placeholder="明文密码，保存后加密存储" />
          </div>

          {/* 8. 备注 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注</label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="加密存储的补充信息" />
          </div>

          {/* 9. 状态下拉 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">状态</label>
            <Select value={form.is_active ? 'active' : 'inactive'} onValueChange={v => set('is_active', v === 'active')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">使用中</SelectItem>
                <SelectItem value="inactive">已废弃</SelectItem>
              </SelectContent>
            </Select>
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

  // 点击编辑：先获取明文（如果还没 reveal 过），再打开编辑对话框
  const editItem = async (item) => {
    let data = revealed[item.id];
    if (!data) {
      const r = await api(`/api/vault/items/${item.id}`, { headers: { 'X-Vault-Token': getVaultToken() } });
      if (r.error) {
        if (r.error.message?.includes('过期') || r.error.message?.includes('未解锁')) {
          clearVaultData();
          setUnlocked(false);
          setUnlockDialog(true);
        }
        toast.error(r.error.message);
        return;
      }
      data = { secret: r.data.secret, notes: r.data.notes };
      setRevealed(prev => ({ ...prev, [item.id]: data }));
    }
    setItemDialog({ open: true, initial: { ...item, ...data } });
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
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 sm:px-4 md:px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
          <h1 className="text-base font-semibold truncate">密码保险箱</h1>
          <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md bg-green-50 text-green-600 text-xs flex-shrink-0">
            <Clock className="w-3 h-3" /> {formatRemaining(remainingSec)}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={lockNow} className="text-xs">
            <Lock className="w-3 h-3 mr-1" /> 锁定
          </Button>
          <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setItemDialog({ open: true, initial: null })}>
            <Plus className="w-4 h-4 mr-1" /> 新增
          </Button>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-2 px-3 sm:px-4 md:px-6 py-2.5 bg-white border-b border-gray-100">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索标题/用户名/手机号" className="pl-8 h-8 text-sm" />
        </div>
        {/* 分类 Tab - 分段控件式 */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setCategory('all')} className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all ${category === 'all' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            全部
          </button>
          {CATEGORIES.map(c => (
            <button key={c.value} onClick={() => setCategory(c.value)} className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all flex items-center gap-1 ${category === c.value ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getCategoryStyle(c.value).bar }} />
              {c.label}
            </button>
          ))}
        </div>
        {/* 状态切换 */}
        <button onClick={() => setShowInactive(!showInactive)} className={`h-8 px-2.5 rounded-lg text-xs flex items-center gap-1 transition-all flex-shrink-0 ${showInactive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {showInactive ? '含废弃' : '仅使用中'}
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-gray-400">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mb-4 ring-1 ring-gray-100">
              <Lock className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">保险箱是空的</p>
            <p className="text-xs text-gray-400 mt-1">添加你的第一个账号密码，开始安全管理</p>
            <Button size="sm" className="mt-4 bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setItemDialog({ open: true, initial: null })}>
              <Plus className="w-4 h-4 mr-1" /> 添加条目
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const data = revealed[item.id];
              const isCopied = copiedId === item.id;
              const catStyle = getCategoryStyle(item.category);
              const CatIcon = catStyle.icon;
              return (
                <div key={item.id} className="group relative bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all duration-200 overflow-hidden">
                  {/* 左侧分类色条 */}
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: catStyle.bar }} />

                  <div className="pl-4 pr-3 py-3">
                    {/* 头部行：分类图标 + 标题 + 状态 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: catStyle.tint }}>
                            <CatIcon className="w-3.5 h-3.5" style={{ color: catStyle.bar }} />
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-600 truncate inline-flex items-center gap-0.5 text-xs flex-shrink-0">
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate max-w-[120px]">{item.url.replace(/^https?:\/\//, '').slice(0, 30)}</span>
                            </a>
                          )}
                          {item.is_active ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100 flex-shrink-0">使用中</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100 flex-shrink-0">已废弃</span>
                          )}
                        </div>
                        {/* 用户名 */}
                        {item.username && (
                          <div className="mt-1 text-xs text-gray-500 pl-8 truncate">{item.username}</div>
                        )}
                      </div>
                      {/* hover 操作 */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                        <button onClick={() => editItem(item)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="编辑">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(item)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="删除">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 联系方式 + 登录方式 */}
                    {(item.phone || item.email || (Array.isArray(item.login_methods) && item.login_methods.length > 0)) && (
                      <div className="flex items-center gap-2 flex-wrap mt-1.5 pl-8">
                        {item.phone && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Smartphone className="w-3 h-3" />{item.phone}
                          </span>
                        )}
                        {item.email && (
                          <span className="text-[11px] text-gray-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />{item.email}
                          </span>
                        )}
                        {Array.isArray(item.login_methods) && item.login_methods.map(m => (
                          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                            {getLoginMethodLabel(m)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 密码区 - 视觉焦点 */}
                    <div className="mt-2 mx-8 flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                      <code className="flex-1 text-xs font-mono text-gray-600 min-w-0 truncate">
                        {data ? (showSecret[item.id] ? data.secret : '••••••••••••') : '••••••••••••'}
                      </code>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => { revealSecret(item.id); setShowSecret(s => ({ ...s, [item.id]: !s[item.id] })); }} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                          {showSecret[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => copySecret(item.id)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                          {isCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* 备注 */}
                    {data?.notes && <p className="text-[11px] text-gray-400 mt-1.5 break-words">{data.notes}</p>}
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
        <AlertDialogContent className="w-full max-w-md mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
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
