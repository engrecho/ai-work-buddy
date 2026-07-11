import { lazy } from 'react';

const Index = lazy(() => import('./pages/Index'));

// 所有页面都在 Index 内通过 URL ?tab= 和 ?id= 控制
// 此文件仅保留用于兼容性导入
export const navItems = [
  { to: '/', page: <Index /> },
];
