import { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Plus, Calendar, Pill, ChevronLeft, Trash2, Clock, AlertCircle, X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// ════════════════════════════════════════════════════════════════════
// 设计系统（统一字号 / 间距 / 触摸目标）
// 移动端优先：所有可点击元素最小 36px，字号统一用 Tailwind 标准档
//   text-xs(12px)  = 标签 / 元信息
//   text-sm(14px)  = 正文 / 卡片标题
//   text-base(16px)= 页面标题
//   禁止使用 text-[10px] / text-[11px] / text-[9px] 等任意值
// ════════════════════════════════════════════════════════════════════

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
    headers: { ...getAuthHeaders(!!options.body && !(options.body instanceof FormData)), ...(options.headers || {}) },
  };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
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

// 上传健康图片（药物照片、就诊附件等）
async function uploadHealthImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('ai_buddy_token');
  const res = await fetch('/api/health/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: formData,
  });
  const r = await res.json();
  if (r.error) { toast.error(r.error.message); return null; }
  return r.data?.url || null;
}

// 清理表单数据：空字符串 → null，删除 id 字段
function cleanForm(form) {
  const cleaned = { ...form };
  delete cleaned.id;
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === '') cleaned[key] = null;
  }
  return cleaned;
}

const COLOR_OPTIONS = ['#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#8b5cf6', '#ef4444', '#6b7280'];

function calcAge(birthDate) {
  if (!birthDate) return '';
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return `${age}岁`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateRange(start, end) {
  if (!start && !end) return '';
  if (start && end) return `${formatDate(start)} ~ ${formatDate(end)}`;
  return formatDate(start || end);
}

function genderText(g) {
  return g === 'male' ? '男' : g === 'female' ? '女' : '';
}

// ════════════════════════════════════════════════════════════════════
// 单图上传组件（药物照片）— 移动端响应式缩放
// ════════════════════════════════════════════════════════════════════
function SingleImageUpload({ value, onChange, label = '图片' }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadHealthImage(file);
    setUploading(false);
    if (url) onChange(url);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      {label && <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>}
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative group flex-shrink-0">
            <img
              src={value}
              alt="预览"
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover border border-gray-200"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md transition-transform active:scale-90"
              aria-label="删除图片"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors flex-shrink-0 active:scale-95"
          >
            {uploading ? (
              <span className="text-xs">上传中</span>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                <span className="text-xs">添加</span>
              </>
            )}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 多图上传组件（就诊附件，支持备注）— 移动端优化
// ════════════════════════════════════════════════════════════════════
function MultiImageUpload({ items = [], onChange }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const newItems = [...items];
    for (const file of files) {
      const url = await uploadHealthImage(file);
      if (url) newItems.push({ url, note: '' });
    }
    onChange(newItems);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const updateNote = (idx, note) => {
    onChange(items.map((it, i) => i === idx ? { ...it, note } : it));
  };

  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-500">附件图片</label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs text-[#5a7a00] hover:text-[#2d4a00] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[#bbea3b]/20 transition-colors active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> {uploading ? '上传中...' : '添加图片'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFile} className="hidden" />
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start p-2 rounded-lg bg-gray-50">
              <img src={item.url} alt={`附件${idx + 1}`} className="w-12 h-12 sm:w-14 sm:h-14 rounded-md object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <Input
                  value={item.note || ''}
                  onChange={e => updateNote(idx, e.target.value)}
                  placeholder="图片备注（可选）"
                  className="text-xs h-8"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 rounded-md flex-shrink-0 transition-colors active:scale-90"
                aria-label="删除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 图片预览 Modal — 移动端支持双指缩放
// ════════════════════════════════════════════════════════════════════
function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 touch-manipulation"
      onClick={onClose}
    >
      <img
        src={src}
        alt="预览"
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
        onClick={e => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors active:scale-90"
        onClick={onClose}
        aria-label="关闭"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 药物状态 Badge — 统一样式
// ════════════════════════════════════════════════════════════════════
function MedicationStatusBadge({ status }) {
  if (status === 'active') return <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">服用中</Badge>;
  if (status === 'stopped') return <Badge variant="secondary" className="text-xs">已停药</Badge>;
  if (status === 'as_needed') return <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">酌情使用</Badge>;
  return null;
}

// ════════════════════════════════════════════════════════════════════
// 表单字段组件 — 统一 label + 内容布局
// ════════════════════════════════════════════════════════════════════
function Field({ label, required, children, className = '' }) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 档案表单弹窗 — 移动端单列、桌面端双列
// ════════════════════════════════════════════════════════════════════
function ProfileFormDialog({ open, onClose, onSubmit, initial }) {
  const [form, setForm] = useState({
    patient_name: '', patient_avatar_url: '', gender: 'unknown', birth_date: '',
    disease_name: '', color: COLOR_OPTIONS[0], status: 'active', notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(initial || {
        patient_name: '', patient_avatar_url: '', gender: 'unknown', birth_date: '',
        disease_name: '', color: COLOR_OPTIONS[0], status: 'active', notes: '',
      });
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.patient_name.trim()) { toast.error('请填写患者姓名'); return; }
    if (!form.disease_name.trim()) { toast.error('请填写疾病名称'); return; }
    onSubmit(cleanForm(form));
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">{initial ? '编辑档案' : '新建健康档案'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col sm:flex-row gap-4">
            <Field label="患者姓名" required className="flex-1 min-w-0">
              <Input value={form.patient_name} onChange={e => set('patient_name', e.target.value)} placeholder="如：张三 / 父亲" />
            </Field>
            <Field label="性别" className="w-full sm:w-28 flex-shrink-0">
              <Select value={form.gender} onValueChange={v => set('gender', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">男</SelectItem>
                  <SelectItem value="female">女</SelectItem>
                  <SelectItem value="unknown">未知</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <Field label="出生日期" className="flex-1 min-w-0">
              <Input type="date" value={form.birth_date || ''} onChange={e => set('birth_date', e.target.value)} />
            </Field>
            <Field label="状态" className="flex-1 min-w-0">
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">跟踪中</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="疾病名称" required>
            <Input value={form.disease_name} onChange={e => set('disease_name', e.target.value)} placeholder="如：高血压 / 2型糖尿病" />
          </Field>
          <Field label="标识颜色">
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)}
                  className={`w-8 h-8 rounded-md transition-transform active:scale-90 hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
          </Field>
          <Field label="备注">
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="过敏史、特殊注意等" />
          </Field>
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
// 就诊记录表单 — 移动端单列
// ════════════════════════════════════════════════════════════════════
function VisitFormDialog({ open, onClose, onSubmit, initial, profileId }) {
  const [form, setForm] = useState({
    visit_date: new Date().toISOString().slice(0, 10), hospital: '', department: '', doctor: '',
    chief_complaint: '', diagnosis: '', prescription: '', examination: '',
    next_visit_date: '', next_visit_date_end: '', cost: '', attachment_urls: [],
  });

  useEffect(() => {
    if (open) {
      const base = {
        visit_date: new Date().toISOString().slice(0, 10), hospital: '', department: '', doctor: '',
        chief_complaint: '', diagnosis: '', prescription: '', examination: '',
        next_visit_date: '', next_visit_date_end: '', cost: '', attachment_urls: [],
      };
      if (initial) {
        setForm({
          ...base,
          ...initial,
          attachment_urls: Array.isArray(initial.attachment_urls) ? initial.attachment_urls : [],
        });
      } else {
        setForm(base);
      }
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.visit_date) { toast.error('请填写就诊日期'); return; }
    const cleaned = cleanForm(form);
    cleaned.profile_id = profileId;
    cleaned.cost = form.cost ? parseFloat(form.cost) : null;
    cleaned.attachment_urls = form.attachment_urls || [];
    onSubmit(cleaned);
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-2xl mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">{initial ? '编辑就诊记录' : '新增就诊记录'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="就诊日期" required>
            <Input type="date" value={form.visit_date || ''} onChange={e => set('visit_date', e.target.value)} />
          </Field>
          <div className="flex flex-col sm:flex-row gap-4">
            <Field label="医院" className="flex-1 min-w-0">
              <Input value={form.hospital || ''} onChange={e => set('hospital', e.target.value)} placeholder="如：市第一人民医院" />
            </Field>
            <Field label="科室" className="w-full sm:w-32 flex-shrink-0">
              <Input value={form.department || ''} onChange={e => set('department', e.target.value)} placeholder="如：心内科" />
            </Field>
            <Field label="医生" className="w-full sm:w-32 flex-shrink-0">
              <Input value={form.doctor || ''} onChange={e => set('doctor', e.target.value)} />
            </Field>
          </div>
          <Field label="主诉">
            <Input value={form.chief_complaint || ''} onChange={e => set('chief_complaint', e.target.value)} placeholder="如：头晕、胸闷一周" />
          </Field>
          <Field label="诊断结果">
            <Textarea value={form.diagnosis || ''} onChange={e => set('diagnosis', e.target.value)} rows={2} />
          </Field>
          <Field label="处方 / 用药方案">
            <Textarea value={form.prescription || ''} onChange={e => set('prescription', e.target.value)} rows={3} placeholder="医生开的药、剂量、用法" />
          </Field>
          <Field label="检查报告">
            <Textarea value={form.examination || ''} onChange={e => set('examination', e.target.value)} rows={3} placeholder="化验结果、检查所见" />
          </Field>

          {/* 下次就诊日期区间（非必填） */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Field label="下次就诊（开始）" className="flex-1 min-w-0">
              <Input type="date" value={form.next_visit_date || ''} onChange={e => set('next_visit_date', e.target.value)} />
            </Field>
            <Field label="下次就诊（结束）" className="flex-1 min-w-0">
              <Input type="date" value={form.next_visit_date_end || ''} onChange={e => set('next_visit_date_end', e.target.value)} />
            </Field>
          </div>

          <Field label="费用（元）">
            <Input type="number" step="0.01" value={form.cost || ''} onChange={e => set('cost', e.target.value)} placeholder="0.00" className="max-w-[200px]" />
          </Field>

          {/* 附件图片 */}
          <MultiImageUpload
            items={form.attachment_urls || []}
            onChange={items => set('attachment_urls', items)}
          />
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
// 药物表单 — 移动端单列
// ════════════════════════════════════════════════════════════════════
function MedicationFormDialog({ open, onClose, onSubmit, initial, profileId, visitId }) {
  const [form, setForm] = useState({
    name: '', photo_url: '', usage_instruction: '', dosage: '',
    start_date: '', end_date: '', status: 'active', notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(initial || {
        name: '', photo_url: '', usage_instruction: '', dosage: '',
        start_date: '', end_date: '', status: 'active', notes: '',
      });
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('请填写药物名称'); return; }
    const cleaned = cleanForm(form);
    cleaned.profile_id = profileId;
    cleaned.visit_id = visitId || null;
    onSubmit(cleaned);
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg mx-auto rounded-none sm:rounded-xl max-h-[100dvh] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base">{initial ? '编辑药物' : '新增药物'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="药物名称" required>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="如：阿司匹林肠溶片" />
          </Field>

          {/* 药物图片 */}
          <SingleImageUpload
            value={form.photo_url || ''}
            onChange={url => set('photo_url', url)}
            label="药物图片"
          />

          <Field label="用量">
            <Input value={form.dosage || ''} onChange={e => set('dosage', e.target.value)} placeholder="如：每次1片，每日3次，饭后服" />
          </Field>
          <Field label="用药说明">
            <Textarea value={form.usage_instruction || ''} onChange={e => set('usage_instruction', e.target.value)} rows={2} placeholder="注意事项、禁忌等" />
          </Field>

          {/* 日期可空 */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Field label="开始日期" className="flex-1 min-w-0">
              <Input type="date" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
            </Field>
            <Field label="结束日期" className="flex-1 min-w-0">
              <Input type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} />
            </Field>
          </div>

          {/* 状态：含「酌情使用」 */}
          <Field label="状态">
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">服用中</SelectItem>
                <SelectItem value="as_needed">酌情使用</SelectItem>
                <SelectItem value="stopped">已停药</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="备注">
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </Field>
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
const HealthPage = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const [profileDialog, setProfileDialog] = useState({ open: false, initial: null });
  const [visitDialog, setVisitDialog] = useState({ open: false, initial: null });
  const [medDialog, setMedDialog] = useState({ open: false, initial: null });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    const r = await api('/api/health/profiles/with-stats');
    if (r.data) setProfiles(r.data);
    else if (r.error) toast.error(r.error.message);
    setLoading(false);
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    const r = await api(`/api/health/profiles/${id}/detail`);
    if (r.data) setSelectedProfile(r.data);
    else if (r.error) toast.error(r.error.message);
    setDetailLoading(false);
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  // ── 档案操作（PATCH 带 filter，body 不带 id）─────────────
  const saveProfile = async (form) => {
    const isNew = !profileDialog.initial;
    const id = profileDialog.initial?.id;
    const path = isNew ? '/api/health_profiles' : `/api/health_profiles?filter=eq:id:${id}&single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '档案已创建' : '已保存');
    setProfileDialog({ open: false, initial: null });
    loadProfiles();
    if (selectedProfile && selectedProfile.id === id) loadDetail(id);
  };

  const saveVisit = async (form) => {
    const isNew = !visitDialog.initial;
    const id = visitDialog.initial?.id;
    const path = isNew ? '/api/health_visits' : `/api/health_visits?filter=eq:id:${id}&single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '就诊记录已添加' : '已保存');
    setVisitDialog({ open: false, initial: null });
    if (selectedProfile) loadDetail(selectedProfile.id);
    loadProfiles();
  };

  const saveMed = async (form) => {
    const isNew = !medDialog.initial;
    const id = medDialog.initial?.id;
    const path = isNew ? '/api/health_medications' : `/api/health_medications?filter=eq:id:${id}&single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '药物已添加' : '已保存');
    setMedDialog({ open: false, initial: null });
    if (selectedProfile) loadDetail(selectedProfile.id);
    loadProfiles();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    const tableMap = { profile: 'health_profiles', visit: 'health_visits', medication: 'health_medications' };
    const table = tableMap[type];
    const r = await api(`/api/${table}?filter=eq:id:${id}`, { method: 'DELETE' });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success('已删除');
    setDeleteTarget(null);
    if (type === 'profile') { setSelectedProfile(null); loadProfiles(); }
    else if (selectedProfile) loadDetail(selectedProfile.id);
  };

  // ── 档案列表视图 ─────────────────────────────────────────
  if (!selectedProfile) {
    return (
      <div className="h-full flex flex-col bg-[#f5f5f5]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <Heart className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <h1 className="text-base font-semibold">健康档案</h1>
            <Badge variant="secondary" className="text-xs ml-1">{profiles.length}</Badge>
          </div>
          <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black flex-shrink-0 active:scale-95" onClick={() => setProfileDialog({ open: true, initial: null })}>
            <Plus className="w-4 h-4 mr-1" /> 新建
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-gray-400">
              <Heart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm mb-3">还没有健康档案</p>
              <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black active:scale-95" onClick={() => setProfileDialog({ open: true, initial: null })}>
                <Plus className="w-4 h-4 mr-1" /> 新建第一个档案
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {profiles.map(p => {
                const nextDays = p.next_visit ? daysUntil(p.next_visit.next_visit_date) : null;
                const ageText = calcAge(p.birth_date);
                const gText = genderText(p.gender);
                return (
                  <div
                    key={p.id}
                    onClick={() => loadDetail(p.id)}
                    className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: p.color || '#ccc' }} />
                    {/* 头部：头像 + 姓名 + 年龄 */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ backgroundColor: p.color || '#ccc' }}>
                        {p.patient_name.slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{p.patient_name}</span>
                          {p.status === 'archived' && <Badge variant="secondary" className="text-xs">已归档</Badge>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {ageText}{ageText && gText ? ' · ' : ''}{gText}
                        </div>
                      </div>
                    </div>
                    {/* 疾病 */}
                    <div className="text-sm font-medium text-gray-700 mb-3 truncate">{p.disease_name}</div>
                    {/* 统计信息 */}
                    <div className="space-y-1.5 text-xs text-gray-500">
                      {p.last_visit && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">最近就诊：{formatDate(p.last_visit.visit_date)} {p.last_visit.hospital}</span>
                        </div>
                      )}
                      {p.active_medication_count > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Pill className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>服用药物：{p.active_medication_count} 种</span>
                        </div>
                      )}
                      {p.visit_count > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>就诊次数：{p.visit_count}</span>
                        </div>
                      )}
                    </div>
                    {/* 下次就诊提醒 */}
                    {nextDays !== null && (
                      <div className={`mt-3 px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${nextDays <= 3 ? 'bg-rose-50 text-rose-600' : nextDays <= 7 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
                        {nextDays <= 3 && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span className="truncate">下次就诊：{formatDateRange(p.next_visit.next_visit_date, p.next_visit.next_visit_date_end)}</span>
                        <span className="flex-shrink-0">{nextDays > 0 ? `(${nextDays}天后)` : nextDays === 0 ? '(今天)' : '(已过期)'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <ProfileFormDialog
          open={profileDialog.open}
          onClose={() => setProfileDialog({ open: false, initial: null })}
          onSubmit={saveProfile}
          initial={profileDialog.initial}
        />
        <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>确认删除</AlertDialogTitle></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ── 档案详情视图 ─────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#f5f5f5]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedProfile(null); loadProfiles(); }} className="flex-shrink-0 active:scale-95">
            <ChevronLeft className="w-4 h-4" /> 返回
          </Button>
          <div className="h-4 w-px bg-gray-200 mx-0.5 flex-shrink-0" />
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0" style={{ backgroundColor: selectedProfile.color || '#ccc' }}>
            {selectedProfile.patient_name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-sm block truncate">{selectedProfile.patient_name}</span>
            <span className="text-xs text-gray-400 block truncate">{selectedProfile.disease_name}</span>
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setProfileDialog({ open: true, initial: selectedProfile })} className="active:scale-95">编辑</Button>
          <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 active:scale-95" onClick={() => setDeleteTarget({ type: 'profile', id: selectedProfile.id, name: selectedProfile.patient_name })}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
          {/* 基本信息 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-0.5">年龄</div>
                <div className="text-sm font-medium">{calcAge(selectedProfile.birth_date) || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">性别</div>
                <div className="text-sm font-medium">{genderText(selectedProfile.gender) || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">出生日期</div>
                <div className="text-sm font-medium">{formatDate(selectedProfile.birth_date) || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-0.5">就诊次数</div>
                <div className="text-sm font-medium">{selectedProfile.visits?.length || 0}</div>
              </div>
            </div>
            {selectedProfile.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-400 mb-1">备注</div>
                <p className="text-sm">{selectedProfile.notes}</p>
              </div>
            )}
          </div>

          {/* 当前用药 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-green-500" />
                <h3 className="text-sm font-semibold">用药清单</h3>
                <Badge variant="secondary" className="text-xs">{selectedProfile.medications?.length || 0}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setMedDialog({ open: true, initial: null })} className="active:scale-95">
                <Plus className="w-3.5 h-3.5 mr-1" /> 添加药物
              </Button>
            </div>
            {selectedProfile.medications?.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">暂无药物记录</p>
            ) : (
              <div className="space-y-2">
                {selectedProfile.medications?.map(med => (
                  <div key={med.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    {/* 药物图片 */}
                    <div
                      className="w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden bg-green-50 cursor-pointer"
                      onClick={() => med.photo_url && setPreviewImage(med.photo_url)}
                    >
                      {med.photo_url
                        ? <img src={med.photo_url} alt={med.name} className="w-full h-full object-cover" />
                        : <Pill className="w-5 h-5 text-green-500" />}
                    </div>
                    {/* 药物信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{med.name}</span>
                        <MedicationStatusBadge status={med.status} />
                      </div>
                      {med.dosage && <div className="text-xs text-gray-500 mt-1">{med.dosage}</div>}
                      {med.usage_instruction && <div className="text-xs text-gray-400 mt-0.5">{med.usage_instruction}</div>}
                      {(med.start_date || med.end_date) && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatDateRange(med.start_date, med.end_date) || '未设日期'}
                          {med.start_date && !med.end_date && ' ~ 至今'}
                        </div>
                      )}
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => setMedDialog({ open: true, initial: med })}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors active:scale-90"
                        aria-label="编辑"
                      >
                        <Pill className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: 'medication', id: med.id, name: med.name })}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors active:scale-90"
                        aria-label="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 就诊历史时间轴 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold">就诊记录</h3>
                <Badge variant="secondary" className="text-xs">{selectedProfile.visits?.length || 0}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setVisitDialog({ open: true, initial: null })} className="active:scale-95">
                <Plus className="w-3.5 h-3.5 mr-1" /> 添加就诊
              </Button>
            </div>
            {selectedProfile.visits?.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">暂无就诊记录</p>
            ) : (
              <div className="space-y-1">
                {selectedProfile.visits?.map((v) => (
                  <div key={v.id} className="relative pl-6 py-3 border-l-2 border-gray-100 last:border-l-0">
                    <div className="absolute left-[-5px] top-4 w-2 h-2 rounded-full bg-blue-400" />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* 就诊日期 + 医院 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{formatDate(v.visit_date)}</span>
                          {v.hospital && <span className="text-xs text-gray-500">{v.hospital}</span>}
                          {v.department && <Badge variant="outline" className="text-xs">{v.department}</Badge>}
                          {v.doctor && <span className="text-xs text-gray-400">{v.doctor}医生</span>}
                        </div>
                        {/* 就诊详情 */}
                        {v.chief_complaint && <div className="text-xs text-gray-600 mt-1.5">主诉：{v.chief_complaint}</div>}
                        {v.diagnosis && <div className="text-xs text-gray-600 mt-1">诊断：{v.diagnosis}</div>}
                        {v.prescription && <div className="text-xs text-gray-600 mt-1">处方：{v.prescription}</div>}
                        {v.examination && <div className="text-xs text-gray-500 mt-1">检查：{v.examination}</div>}
                        {/* 费用 + 下次就诊 */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                          {v.cost != null && <span>费用：¥{Number(v.cost).toFixed(2)}</span>}
                          {(v.next_visit_date || v.next_visit_date_end) && (
                            <span className="text-amber-600">下次就诊：{formatDateRange(v.next_visit_date, v.next_visit_date_end)}</span>
                          )}
                        </div>
                        {/* 就诊附件图片 */}
                        {Array.isArray(v.attachment_urls) && v.attachment_urls.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {v.attachment_urls.map((att, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={att.url}
                                  alt={`附件${idx + 1}`}
                                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-md object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => setPreviewImage(att.url)}
                                />
                                {att.note && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-b-md truncate max-w-full">
                                    {att.note}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 操作按钮 */}
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setVisitDialog({ open: true, initial: v })}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors active:scale-90"
                          aria-label="编辑"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: 'visit', id: v.id, name: '就诊记录' })}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors active:scale-90"
                          aria-label="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ProfileFormDialog
        open={profileDialog.open}
        onClose={() => setProfileDialog({ open: false, initial: null })}
        onSubmit={saveProfile}
        initial={profileDialog.initial}
      />
      <VisitFormDialog
        open={visitDialog.open}
        onClose={() => setVisitDialog({ open: false, initial: null })}
        onSubmit={saveVisit}
        initial={visitDialog.initial}
        profileId={selectedProfile?.id}
      />
      <MedicationFormDialog
        open={medDialog.open}
        onClose={() => setMedDialog({ open: false, initial: null })}
        onSubmit={saveMed}
        initial={medDialog.initial}
        profileId={selectedProfile?.id}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除「{deleteTarget?.name}」？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 图片预览 Modal */}
      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};

export default HealthPage;
