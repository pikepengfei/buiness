import { defineStore } from 'pinia';
import { cms } from '@/api/cms';
import type { SiteConfig, MenuItem } from '@/types/cms';

interface SiteState {
  loaded: boolean;
  loading: boolean;
  settings: SiteConfig['settings'];
  menus: MenuItem[];
}

export const useSiteStore = defineStore('site', {
  state: (): SiteState => ({
    loaded: false,
    loading: false,
    settings: {},
    menus: [],
  }),
  getters: {
    brandColor: (s) => s.settings.general?.brand_color || '#DE6420',
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
    async ensureLoaded() {
      if (this.loaded || this.loading) return;
      this.loading = true;
      try {
        const cfg = await cms.getSite();
        this.settings = cfg.settings;
        this.menus = cfg.menus;
        this.loaded = true;
      } catch (e) {
        console.error('加载站点配置失败', e);
      } finally {
        this.loading = false;
      }
    },
  },
});
