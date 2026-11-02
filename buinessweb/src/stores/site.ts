import { defineStore } from 'pinia';
import { cms } from '@/api/cms';
import type { SiteConfig, MenuItem } from '@/types/cms';

interface SiteState {
  loaded: boolean;
  loading: boolean;
  settings: SiteConfig['settings'];
  menus: MenuItem[];
  footerMenus: MenuItem[];
  ctaMenu: MenuItem | null;
}

/** 未上传自定义 Logo 时官网沿用的内置资源；与 backend 006_site_logo.sql 种子值一致 */
export const DEFAULT_LOGO_URL = '/website/img/logo-orange.png';

export const useSiteStore = defineStore('site', {
  state: (): SiteState => ({
    loaded: false,
    loading: false,
    settings: {},
    menus: [],
    footerMenus: [],
    ctaMenu: null,
  }),
  getters: {
    brandColor: (s) => s.settings.general?.brand_color || '#DE6420',
    /** 顶栏 Logo：站点设置上传的固定命名图（/uploads/brand/logo.<ext>?v=…），未配置时用内置资源 */
    logoUrl: (s) => s.settings.general?.logo_url || DEFAULT_LOGO_URL,
    siteName: (s) => s.settings.general?.site_name || 'Centremix 芯联创',
    slogan: (s) => s.settings.general?.slogan || '',
    companyName: (s) => s.settings.general?.company_name || '',
    contactEmail: (s) => s.settings.contact?.contact_email || '',
    contactPhone: (s) => s.settings.contact?.contact_phone || '',
    address: (s) => s.settings.contact?.address || '',
    icp: (s) => s.settings.general?.icp || '',
    social: (s) => s.settings.social || {},
  },
  actions: {
    // force=true 用于后台改完导航/设置后让官网立即生效（接口已是 no-cache + ETag，不会重复传输 body）
    async ensureLoaded(force = false) {
      if (this.loaded && !force) return;
      if (this.loading) return;
      this.loading = true;
      try {
        const cfg = await cms.getSite();
        this.settings = cfg.settings;
        this.menus = cfg.menus;
        this.footerMenus = cfg.footerMenus ?? [];
        this.ctaMenu = cfg.ctaMenu ?? null;
        this.loaded = true;
      } catch (e) {
        console.error('加载站点配置失败', e);
      } finally {
        this.loading = false;
      }
    },
  },
});
