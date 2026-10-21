/**
 * API 接口定义
 *
 * 核心职责：
 *   1. 定义所有后端 API 接口
 *   2. 统一管理请求路径和参数类型
 */
import axios from '@/utils/http';

/**
 * 获取当前登录用户信息
 *
 * @returns 用户信息（包含菜单树、按钮权限等）
 */
export const getUserInfo = () => {
  return axios({
    url: '/v1/webapi/user/currentUserInfo',
    method: 'get'
  });
};

/** 退出登录请求参数 */
interface LogoutData {
  url: string;
}

/**
 * 退出登录
 *
 * @param logoutData - 包含当前页面 URL，用于认证中心回调
 * @returns 退出登录结果
 */
export const logout = (logoutData: LogoutData) => {
  return axios({
    url: '/v1/webapi/cas/client/logout',
    method: 'post',
    data: {
      url: logoutData.url
    }
  });
};
