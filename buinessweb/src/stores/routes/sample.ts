/**
 * 样例：前端路由扩展配置模块（供参考，可删可不删）
 *
 * 本文件演示了全部配置特性的用法，在 stores/staticRoutes.ts 中取消注释引用即可生效。
 * 接手真实项目后：可保留本文件但保持注释不启用，或直接删除，均不影响运行。
 */
import type { MenuItem } from '@/types/global';

/**
 * {
    cached: true              if set true, the page will be cached

    // 当路由设置了该属性，则会高亮相对应的侧边栏。
    // 这在某些场景非常有用，比如：一个文章的列表页路由为：/article/list
    // 点击文章进入文章详情页，这时候路由为/article/1，但你想在侧边栏高亮文章列表的路由，就可以进行如下设置列表的name
    activeMenu: 'article-list'

    // 为了支持带参数的动态路由匹配paramsm模式 filePath filePathName 为必填项
    filePath: 为了支持带参数的动态路由匹配paramsm模式，filePath 可以自定义引入组件路径，
    filePathName: 自定义name
    paramsTitle:  类型为parmas对象中的成员key, 页签展示标题展示为title + 动态parmas对象中的成员key 对应的value值
    activePopoverMenu: 匹配四级五级 滑过之后的菜单高亮显示
  }
 */

// 匹配规则为接口返回对应的url, 一级一级的匹配，如果匹配子级url,需要先把父级url写上
export const sampleRoutes: MenuItem[] = [
  {
    url: '/feiyong',
    children: [
      {
        url: '/two-one',
        children: [
          {
            url: '/organization',
            children: [
              {
                url: '/list',
                cached: true
              },
              {
                url: '/add',
                activeMenu: 'feiyong-two-one-organization-list'
              },
              {
                url: '/:id',
                filePath: () => import(`@/views/feiyong/two-one/organization/detail/index.vue`),
                filePathName: 'feiyong-two-one-organization-detail',
                paramsTitle: 'id',
                activeMenu: 'feiyong-two-one-organization-list'
              }
            ]
          }
        ]
      },
      {
        url: '/two-two',
        children: [
          {
            url: '/tenant',
            cached: true
          }
        ]
      },
      {
        url: '/duizhang12/:name',
        filePath: () => import(`@/views/feiyong/duizhang12/index.vue`),
        filePathName: 'feiyong-duizhang12',
        paramsTitle: 'name',
        activeMenu: 'feiyong-duizhang12'
      }
    ]
  },
  {
    url: '/huoyuan',

    children: [
      {
        url: '/two-one',
        children: [
          {
            url: '/lixiang',
            children: [
              // 需要选中的四级五级 都需要匹配上一级
              {
                url: '/list',
                activeMenu: 'huoyuan-two-one-lixiang',
                children: [
                  {
                    url: '/list',
                    activeMenu: 'huoyuan-two-one-lixiang'
                  },
                  {
                    url: '/add',
                    activeMenu: 'huoyuan-two-one-lixiang',
                    activePopoverMenu: 'huoyuan-two-one-lixiang-list-list'
                  },
                  {
                    url: '/:id',
                    filePath: () => import(`@/views/huoyuan/two-one/lixiang/list/detail/index.vue`),
                    filePathName: 'huoyuan-two-one-lixiang-list-detail',
                    paramsTitle: 'id',
                    activeMenu: 'huoyuan-two-one-lixiang',
                    activePopoverMenu: 'huoyuan-two-one-lixiang-list-list'
                  }
                ]
              },
              {
                url: '/listDetail',
                activeMenu: 'huoyuan-two-one-lixiang',
                activePopoverMenu: 'huoyuan-two-one-lixiang-list'
              },
              {
                url: '/list3',
                activeMenu: 'huoyuan-two-one-lixiang'
              },
              {
                url: '/list4',
                activeMenu: 'huoyuan-two-one-lixiang',

                children: [
                  {
                    url: '/child',
                    activeMenu: 'huoyuan-two-one-lixiang',
                    activePopoverMenu: 'huoyuan-two-one-lixiang-list4',
                    children: [
                      {
                        url: '/list',
                        activeMenu: 'huoyuan-two-one-lixiang'
                      },
                      {
                        url: '/add',
                        activeMenu: 'huoyuan-two-one-lixiang',
                        activePopoverMenu: 'huoyuan-two-one-lixiang-list4-child-list'
                      },
                      {
                        url: '/:id',
                        filePath: () =>
                          import(`@/views/huoyuan/two-one/lixiang/list4/child/detail/index.vue`),
                        filePathName: 'huoyuan-two-one-lixiang-list4-child-detail',
                        paramsTitle: 'id',
                        activeMenu: 'huoyuan-two-one-lixiang',
                        activePopoverMenu: 'huoyuan-two-one-lixiang-list4-child-list'
                      }
                    ]
                  },
                  {
                    url: '/child2',
                    activeMenu: 'huoyuan-two-one-lixiang',
                    activePopoverMenu: 'huoyuan-two-one-lixiang-list4'
                  },
                  {
                    url: '/child3',
                    activeMenu: 'huoyuan-two-one-lixiang',
                    activePopoverMenu: 'huoyuan-two-one-lixiang-list4'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    url: '/yingxiao/:id',
    cached: true,
    filePath: () => import(`@/views/yingxiao/index.vue`),
    filePathName: 'yingxiao',
    paramsTitle: 'id'
  },
  {
    url: '/huoyuan',
    children: [
      {
        url: '/duizhang12',
        cached: true
      }
    ]
  }
];
