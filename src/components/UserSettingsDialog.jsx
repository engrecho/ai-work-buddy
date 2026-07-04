import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, Camera, Lock, Save, LogOut, Key, Copy, Trash2, Plus, Eye, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function UserSettingsDialog({ trigger, open, onOpenChange }) {
  const { user, login, logout } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);

  // 当切换到 API Key tab 时加载
  useEffect(() => {
    if (open) loadApiKeys();
  }, [open]);

  const loadApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch('/api/auth/api-keys', {
        credentials: 'include',
      });
      const json = await res.json();
      if (!json.error) setApiKeys(json.data || []);
    } catch (err) {
      console.error('加载 API Key 失败', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('请输入 Key 名称');
      return;
    }
    setCreatingKey(true);
    try {
      const res = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setNewlyCreated(json.data);
      setShowKey(true);
      setNewKeyName('');
      await loadApiKeys();
      toast.success('已创建 API Key，请立即保存明文');
    } catch (err) {
      toast.error('创建失败：' + err.message);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id, name) => {
    if (!confirm(`确定撤销「${name}」吗？使用此 Key 的工具将立即失效。`)) return;
    try {
      const res = await fetch(`/api/auth/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      toast.success('已撤销');
      await loadApiKeys();
    } catch (err) {
      toast.error('撤销失败：' + err.message);
    }
  };

  const copyKey = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败')
    );
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nickname, avatar_url: avatarUrl }),
      });
      const result = await res.json();
      if (result.error) {
        toast.error(result.error.message);
      } else {
        // 更新本地用户信息
        const updatedUser = { ...user, ...result.data };
        login(localStorage.getItem('ai_buddy_token'), updatedUser);
        toast.success('资料更新成功');
      }
    } catch (err) {
      toast.error('更新失败，请重试');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新密码至少 6 个字符');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      const result = await res.json();
      if (result.error) {
        toast.error(result.error.message);
      } else {
        toast.success('密码修改成功');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      toast.error('修改失败，请重试');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    logout();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>个人设置</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">基本资料</TabsTrigger>
            <TabsTrigger value="password">修改密码</TabsTrigger>
            <TabsTrigger value="api-key">API Key</TabsTrigger>
          </TabsList>

          {/* 基本资料 */}
          <TabsContent value="profile" className="space-y-4 pt-4">
            {/* 头像 */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-2xl font-semibold overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    (user?.nickname || user?.username || 'U')[0].toUpperCase()
                  )}
                </div>
              </div>
              <div className="w-full">
                <Label htmlFor="avatar-url" className="text-xs text-gray-500">头像 URL</Label>
                <Input
                  id="avatar-url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="输入头像图片链接"
                  className="mt-1"
                />
              </div>
            </div>

            {/* 昵称 */}
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入你的昵称"
              />
            </div>

            {/* 用户名（只读） */}
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={user?.username || ''}
                disabled
                className="bg-gray-50 text-gray-500"
              />
              <p className="text-xs text-gray-400">用户名注册后不可修改</p>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingProfile ? '保存中...' : '保存修改'}
            </Button>
          </TabsContent>

          {/* 修改密码 */}
          <TabsContent value="password" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="old-password">原密码</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入原密码"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码（至少6位）"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={savingPassword}
              className="w-full"
            >
              <Lock className="w-4 h-4 mr-2" />
              {savingPassword ? '修改中...' : '修改密码'}
            </Button>
          </TabsContent>

          {/* API Key 管理 */}
          <TabsContent value="api-key" className="space-y-4 pt-4">
            {/* 新创建的 Key（一次性显示） */}
            {newlyCreated && (
              <div className="p-3 border border-amber-300 bg-amber-50 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-amber-900 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  请立即保存 API Key
                </div>
                <div className="text-xs text-amber-800">
                  关闭后无法再次查看明文，如丢失请撤销后重新创建。
                </div>
                <div className="flex items-center gap-1">
                  <code className="flex-1 px-2 py-1.5 bg-white border border-amber-300 rounded text-xs font-mono break-all">
                    {showKey ? newlyCreated.api_key : '•'.repeat(40)}
                  </code>
                  <Button size="sm" variant="ghost" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => copyKey(newlyCreated.api_key)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setNewlyCreated(null); setShowKey(false); }} className="w-full">
                  我已保存，关闭
                </Button>
              </div>
            )}

            {/* 创建 */}
            <div className="flex gap-2">
              <Input
                placeholder="Key 名称（如：Claude SKILL）"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
              />
              <Button onClick={handleCreateKey} disabled={creatingKey} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                {creatingKey ? '创建中...' : '创建'}
              </Button>
            </div>

            {/* 列表 */}
            {loadingKeys ? (
              <div className="text-xs text-gray-500 py-3 text-center">加载中...</div>
            ) : apiKeys.length === 0 ? (
              <div className="text-xs text-gray-500 py-3 text-center">还没有 API Key</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 border rounded text-sm">
                    <Key className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 truncate">{k.name}</span>
                        {!k.is_active && <Badge variant="destructive" className="text-[10px] py-0">已撤销</Badge>}
                        {k.is_active && k.last_used_at && (
                          <Badge variant="outline" className="text-[10px] py-0 text-green-600 border-green-300">
                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />活跃
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        {k.key_prefix}...
                      </div>
                    </div>
                    {k.is_active && (
                      <Button size="sm" variant="ghost" onClick={() => handleRevokeKey(k.id, k.name)} className="h-6 w-6 p-0 text-red-500 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="text-[11px] text-gray-500 leading-relaxed p-2 bg-blue-50 border border-blue-200 rounded">
              <strong className="text-blue-900">用法：</strong>创建后保存到工具配置文件（如 <code className="bg-white px-1 rounded">~/.buddy-skill/config.json</code>），请求时在 Header 携带 <code className="bg-white px-1 rounded">X-API-Key: 你的Key</code>。
            </div>
          </TabsContent>
        </Tabs>

        <Separator className="my-2" />

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" />
            退出登录
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
