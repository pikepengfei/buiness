/**
 * Axios 请求封装
 *
 * 核心职责：
 *   1. 创建 Axios 实例，配置 baseURL、超时时间等
 *   2. 请求拦截器：自动注入 Authorization 请求头
 *   3. 响应拦截器：统一处理 HTTP 错误（401 跳转登录、403 权限不足等）
 *
 * 特殊说明：
 *   - 401 状态码会自动调用统一认证中心接口进行重新登录
 *   - 所有错误通过 ElNotification 弹出提示
 */
import axios from 'axios';
import type { InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { ElNotification } from 'element-plus';

/** Axios 实例配置 */
const config = {
  baseURL: import.meta.env.VITE_BASE_ORIGIN,
  timeout: 60 * 1000,
  withCredentials: false
};

const _axios = axios.create(config);

/**
 * 请求拦截器
 * 在请求发送前自动注入 Authorization 请求头
 */
_axios.interceptors.request.use(
  function (config: InternalAxiosRequestConfig) {
    config.headers['Authorization'] = localStorage.getItem('Authorization');
    return config;
  },
  function (error: AxiosError) {
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器
 * 统一处理 HTTP 错误状态码：
 *   - 401: 登录过期，自动跳转统一认证中心
 *   - 403: 权限不足
 *   - 404: 资源未找到
 *   - 500: 服务器错误
 */
_axios.interceptors.response.use(
  function (response: AxiosResponse) {
    return response.data;
  },
  function (error: AxiosError) {
    if (!error.response) {
      ElNotification.error({ message: `${error.name}:${error.message}` });
    } else if (error.response.status === 401) {
      ElNotification.error({ message: '登录状态过期!' });

      const currentURL = window.location.href;
      const loginUrl = `${import.meta.env.VITE_BASE_ORIGIN}/v1/webapi/cas/client/dologin`;

      fetch(loginUrl, {
        method: 'POST',
        body: JSON.stringify({
          url: currentURL
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
        .then((response) => response.json())
        .then((res) => {
          window.location.href = res.data;
        })
        .catch((err) => {
          console.error(err);
        });
    } else if (error.response.status === 403) {
      ElNotification.error({ message: '权限不足,请联系管理员!' });
    } else if (error.response.status === 404) {
      ElNotification.error({ message: '未找到您请求的资源!' });
    } else if (error.response.status === 500) {
      ElNotification.error({ message: '服务器错误⊙﹏⊙∥' });
    } else {
      const message =
        error.response.status && error.response.statusText
          ? `HTTP ERROR:(${error.response.status}:${error.response.statusText})`
          : '未知错误!';
      ElNotification.error({ message });
    }
    return Promise.reject(error);
  }
);

export default _axios;
