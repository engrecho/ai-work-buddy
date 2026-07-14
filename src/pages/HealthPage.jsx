import { useState, useEffect, useCallback } from 'react';
import { Heart, Plus, Calendar, Pill, ChevronLeft, Trash2, Clock, AlertCircle } from 'lucide-react';
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

// ════════════════════════════════════════════════════════════════════
// 档案表单弹窗
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
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑档案' : '新建健康档案'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">患者姓名 *</label>
              <Input value={form.patient_name} onChange={e => setForm({ ...form, patient_name: e.target.value })} placeholder="如：张三 / 父亲" />
            </div>
            <div className="w-28">
              <label className="text-xs text-gray-500 mb-1 block">性别</label>
              <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">男</SelectItem>
                  <SelectItem value="female">女</SelectItem>
                  <SelectItem value="unknown">未知</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">出生日期</label>
              <Input type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">状态</label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">跟踪中</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">疾病名称 *</label>
            <Input value={form.disease_name} onChange={e => setForm({ ...form, disease_name: e.target.value })} placeholder="如：高血压 / 2型糖尿病" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">标识颜色</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-md transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注</label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="过敏史、特殊注意等" />
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
// 就诊记录表单
// ════════════════════════════════════════════════════════════════════
function VisitFormDialog({ open, onClose, onSubmit, initial, profileId }) {
  const [form, setForm] = useState({
    visit_date: new Date().toISOString().slice(0, 10), hospital: '', department: '', doctor: '',
    chief_complaint: '', diagnosis: '', prescription: '', examination: '', next_visit_date: '', cost: '',
  });

  useEffect(() => {
    if (open) {
      setForm(initial || {
        visit_date: new Date().toISOString().slice(0, 10), hospital: '', department: '', doctor: '',
        chief_complaint: '', diagnosis: '', prescription: '', examination: '', next_visit_date: '', cost: '',
      });
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.visit_date) { toast.error('请填写就诊日期'); return; }
    onSubmit({ ...form, profile_id: profileId, cost: form.cost ? parseFloat(form.cost) : null });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑就诊记录' : '新增就诊记录'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[65vh] overflow-y-auto py-2">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">就诊日期 *</label>
              <Input type="date" value={form.visit_date} onChange={e => setForm({ ...form, visit_date: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">下次就诊时间</label>
              <Input type="date" value={form.next_visit_date} onChange={e => setForm({ ...form, next_visit_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">医院</label>
              <Input value={form.hospital} onChange={e => setForm({ ...form, hospital: e.target.value })} placeholder="如：市第一人民医院" />
            </div>
            <div className="w-32">
              <label className="text-xs text-gray-500 mb-1 block">科室</label>
              <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="如：心内科" />
            </div>
            <div className="w-32">
              <label className="text-xs text-gray-500 mb-1 block">医生</label>
              <Input value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">主诉</label>
            <Input value={form.chief_complaint} onChange={e => setForm({ ...form, chief_complaint: e.target.value })} placeholder="如：头晕、胸闷一周" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">诊断结果</label>
            <Textarea value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} rows={2} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">处方 / 用药方案</label>
            <Textarea value={form.prescription} onChange={e => setForm({ ...form, prescription: e.target.value })} rows={3} placeholder="医生开的药、剂量、用法" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">检查报告</label>
            <Textarea value={form.examination} onChange={e => setForm({ ...form, examination: e.target.value })} rows={3} placeholder="化验结果、检查所见" />
          </div>
          <div className="w-40">
            <label className="text-xs text-gray-500 mb-1 block">费用（元）</label>
            <Input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="0.00" />
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
// 药物表单
// ════════════════════════════════════════════════════════════════════
function MedicationFormDialog({ open, onClose, onSubmit, initial, profileId, visitId }) {
  const [form, setForm] = useState({
    name: '', photo_url: '', usage_instruction: '', dosage: '',
    start_date: new Date().toISOString().slice(0, 10), end_date: '', status: 'active', notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm(initial || {
        name: '', photo_url: '', usage_instruction: '', dosage: '',
        start_date: new Date().toISOString().slice(0, 10), end_date: '', status: 'active', notes: '',
      });
    }
  }, [open, initial]);

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error('请填写药物名称'); return; }
    onSubmit({ ...form, profile_id: profileId, visit_id: visitId || null });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑药物' : '新增药物'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">药物名称 *</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：阿司匹林肠溶片" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">用量</label>
            <Input value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} placeholder="如：每次1片，每日3次，饭后服" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">用药说明</label>
            <Textarea value={form.usage_instruction} onChange={e => setForm({ ...form, usage_instruction: e.target.value })} rows={2} placeholder="注意事项、禁忌等" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">开始日期</label>
              <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">结束日期</label>
              <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">状态</label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">服用中</SelectItem>
                <SelectItem value="stopped">已停药</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">备注</label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
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
const HealthPage = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null); // 档案详情
  const [detailLoading, setDetailLoading] = useState(false);

  // 弹窗
  const [profileDialog, setProfileDialog] = useState({ open: false, initial: null });
  const [visitDialog, setVisitDialog] = useState({ open: false, initial: null });
  const [medDialog, setMedDialog] = useState({ open: false, initial: null });
  const [deleteTarget, setDeleteTarget] = useState(null); // { type, id, name }

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

  // ── 档案操作 ─────────────────────────────────────────────
  const saveProfile = async (form) => {
    const isNew = !profileDialog.initial;
    const path = isNew ? '/api/health_profiles' : `/api/health_profiles?single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: profileDialog.initial ? { ...form, id: profileDialog.initial.id } : form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '档案已创建' : '已保存');
    setProfileDialog({ open: false, initial: null });
    loadProfiles();
    if (selectedProfile && selectedProfile.id === profileDialog.initial?.id) loadDetail(selectedProfile.id);
  };

  const saveVisit = async (form) => {
    const isNew = !visitDialog.initial;
    const path = isNew ? '/api/health_visits' : `/api/health_visits?single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: visitDialog.initial ? { ...form, id: visitDialog.initial.id } : form });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(isNew ? '就诊记录已添加' : '已保存');
    setVisitDialog({ open: false, initial: null });
    if (selectedProfile) loadDetail(selectedProfile.id);
    loadProfiles();
  };

  const saveMed = async (form) => {
    const isNew = !medDialog.initial;
    const path = isNew ? '/api/health_medications' : `/api/health_medications?single=1&return=1`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await api(path, { method, body: medDialog.initial ? { ...form, id: medDialog.initial.id } : form });
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
    const r = await api(`/api/${table}?id=${id}`, { method: type === 'profile' ? 'DELETE' : 'DELETE' });
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
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500" />
            <h1 className="text-base font-semibold">健康档案</h1>
            <Badge variant="secondary" className="ml-2">{profiles.length}</Badge>
          </div>
          <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setProfileDialog({ open: true, initial: null })}>
            <Plus className="w-4 h-4 mr-1" /> 新建档案
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
          ) : profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 text-gray-400">
              <Heart className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm mb-3">还没有健康档案</p>
              <Button size="sm" className="bg-[#bbea3b] hover:bg-[#a8d435] text-black" onClick={() => setProfileDialog({ open: true, initial: null })}>
                <Plus className="w-4 h-4 mr-1" /> 新建第一个档案
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map(p => {
                const nextDays = p.next_visit ? daysUntil(p.next_visit.next_visit_date) : null;
                return (
                  <div key={p.id}
                    onClick={() => loadDetail(p.id)}
                    className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-all hover:scale-[1.01] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: p.color || '#ccc' }} />
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: p.color || '#ccc' }}>
                          {p.patient_name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{p.patient_name}</div>
                          <div className="text-xs text-gray-400">{calcAge(p.birth_date)} {p.gender === 'male' ? '男' : p.gender === 'female' ? '女' : ''}</div>
                        </div>
                      </div>
                      {p.status === 'archived' && <Badge variant="secondary" className="text-xs">已归档</Badge>}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">{p.disease_name}</div>
                    <div className="space-y-1 text-xs text-gray-500">
                      {p.last_visit && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> 最近就诊：{formatDate(p.last_visit.visit_date)} {p.last_visit.hospital}
                        </div>
                      )}
                      {p.active_medication_count > 0 && (
                        <div className="flex items-center gap-1">
                          <Pill className="w-3 h-3" /> 服用药物：{p.active_medication_count} 种
                        </div>
                      )}
                      {p.visit_count > 0 && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> 就诊次数：{p.visit_count}
                        </div>
                      )}
                    </div>
                    {nextDays !== null && (
                      <div className={`mt-3 px-2 py-1 rounded-md text-xs flex items-center gap-1 ${nextDays <= 3 ? 'bg-rose-50 text-rose-600' : nextDays <= 7 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-500'}`}>
                        {nextDays <= 3 && <AlertCircle className="w-3 h-3" />}
                        下次就诊：{formatDate(p.next_visit.next_visit_date)}
                        {nextDays > 0 ? `（${nextDays}天后）` : nextDays === 0 ? '（今天）' : '（已过期）'}
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
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedProfile(null); loadProfiles(); }}>
            <ChevronLeft className="w-4 h-4" /> 返回
          </Button>
          <div className="h-4 w-px bg-gray-200 mx-1" />
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: selectedProfile.color || '#ccc' }}>
            {selectedProfile.patient_name.slice(0, 1)}
          </div>
          <div>
            <span className="font-semibold text-sm">{selectedProfile.patient_name}</span>
            <span className="text-gray-400 text-xs ml-2">{selectedProfile.disease_name}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setProfileDialog({ open: true, initial: selectedProfile })}>编辑档案</Button>
          <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget({ type: 'profile', id: selectedProfile.id, name: selectedProfile.patient_name })}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {detailLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">加载中...</div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 基本信息 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-400 text-xs">年龄</span><div className="font-medium">{calcAge(selectedProfile.birth_date) || '-'}</div></div>
              <div><span className="text-gray-400 text-xs">性别</span><div className="font-medium">{selectedProfile.gender === 'male' ? '男' : selectedProfile.gender === 'female' ? '女' : '-'}</div></div>
              <div><span className="text-gray-400 text-xs">出生日期</span><div className="font-medium">{formatDate(selectedProfile.birth_date) || '-'}</div></div>
              <div><span className="text-gray-400 text-xs">就诊次数</span><div className="font-medium">{selectedProfile.visits?.length || 0}</div></div>
            </div>
            {selectedProfile.notes && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-gray-400 text-xs">备注</span>
                <p className="text-sm mt-1">{selectedProfile.notes}</p>
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
              <Button size="sm" variant="outline" onClick={() => setMedDialog({ open: true, initial: null })}>
                <Plus className="w-3 h-3 mr-1" /> 添加药物
              </Button>
            </div>
            {selectedProfile.medications?.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无药物记录</p>
            ) : (
              <div className="space-y-2">
                {selectedProfile.medications?.map(med => (
                  <div key={med.id} className="flex items-start gap-3 p-3 rounded-md border border-gray-100 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-md bg-green-50 flex items-center justify-center flex-shrink-0">
                      {med.photo_url ? <img src={med.photo_url} alt={med.name} className="w-full h-full object-cover rounded-md" /> : <Pill className="w-4 h-4 text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{med.name}</span>
                        {med.status === 'active'
                          ? <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100">服用中</Badge>
                          : <Badge variant="secondary" className="text-xs">已停药</Badge>}
                      </div>
                      {med.dosage && <div className="text-xs text-gray-500 mt-0.5">{med.dosage}</div>}
                      {med.usage_instruction && <div className="text-xs text-gray-400 mt-0.5">{med.usage_instruction}</div>}
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatDate(med.start_date)} ~ {med.end_date ? formatDate(med.end_date) : '至今'}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setMedDialog({ open: true, initial: med })} className="h-7 px-2 text-xs">编辑</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: 'medication', id: med.id, name: med.name })} className="h-7 px-2 text-xs text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </Button>
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
              <Button size="sm" variant="outline" onClick={() => setVisitDialog({ open: true, initial: null })}>
                <Plus className="w-3 h-3 mr-1" /> 添加就诊
              </Button>
            </div>
            {selectedProfile.visits?.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无就诊记录</p>
            ) : (
              <div className="space-y-3">
                {selectedProfile.visits?.map((v, idx) => (
                  <div key={v.id} className="relative pl-6 pb-4 border-l-2 border-gray-100 last:border-l-0">
                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-400" />
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{formatDate(v.visit_date)}</span>
                          {v.hospital && <span className="text-xs text-gray-500">{v.hospital}</span>}
                          {v.department && <Badge variant="outline" className="text-xs">{v.department}</Badge>}
                          {v.doctor && <span className="text-xs text-gray-400">{v.doctor}医生</span>}
                        </div>
                        {v.chief_complaint && <div className="text-xs text-gray-600 mt-1">主诉：{v.chief_complaint}</div>}
                        {v.diagnosis && <div className="text-xs text-gray-600 mt-1">诊断：{v.diagnosis}</div>}
                        {v.prescription && <div className="text-xs text-gray-600 mt-1">处方：{v.prescription}</div>}
                        {v.examination && <div className="text-xs text-gray-500 mt-1">检查：{v.examination}</div>}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {v.cost != null && <span>费用：¥{Number(v.cost).toFixed(2)}</span>}
                          {v.next_visit_date && <span className="text-amber-600">下次就诊：{formatDate(v.next_visit_date)}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setVisitDialog({ open: true, initial: v })} className="h-7 px-2 text-xs">编辑</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: 'visit', id: v.id, name: '就诊记录' })} className="h-7 px-2 text-xs text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </Button>
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
    </div>
  );
};

export default HealthPage;
