import { useState } from 'react';
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
import { User, Camera, Lock, Save, LogOut } from 'lucide-react';
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
        login(localStorage.getItem('ai_work_buddy_token'), updatedUser);
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">基本资料</TabsTrigger>
            <TabsTrigger value="password">修改密码</TabsTrigger>
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
