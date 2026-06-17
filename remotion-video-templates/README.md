# Remotion Video Templates 🎬

高价值任务 #45 - Remotion 视频模板库

## 📦 模板列表

### 1. Intro Templates (片头模板)
**位置**: `intros/IntroTemplate`
- 分辨率：1920x1080
- 时长：5 秒 (150 帧 @ 30fps)
- 可定制参数:
  - `title`: 主标题
  - `subtitle`: 副标题
  - `backgroundColor`: 背景颜色
  - `textColor`: 文字颜色

**动画效果**:
- 整体淡入
- 缩放进入
- 副标题从下方滑入

### 2. Typewriter Title (打字机标题)
**位置**: `titles/TypewriterTitle`
- 分辨率：1920x1080
- 时长：4 秒 (120 帧 @ 30fps)
- 可定制参数:
  - `text`: 显示的文字
  - `fontSize`: 字体大小
  - `textColor`: 文字颜色
  - `backgroundColor`: 背景颜色

**动画效果**:
- 逐字打字机效果
- 光标闪烁动画

### 3. Fade Transition (渐变过渡)
**位置**: `transitions/FadeTransition`
- 分辨率：1920x1080
- 时长：3 秒 (90 帧 @ 30fps)
- 可定制参数:
  - `fromColor`: 起始颜色
  - `toColor`: 结束颜色

**动画效果**:
- 平滑颜色过渡
- 透明度渐变

### 4. Social Media Post (社交媒体帖子)
**位置**: `social/SocialMediaPost`
- 分辨率：1080x1080 (Instagram 方形格式)
- 时长：6 秒 (180 帧 @ 30fps)
- 可定制参数:
  - `title`: 标题
  - `description`: 描述
  - `accentColor`: 强调色

**动画效果**:
- 背景脉冲动画
- 内容卡片淡入
- 标题滑入
- 描述延迟滑入
- 底部进度条

### 5. Product Showcase (产品展示)
**位置**: `product/ProductShowcase`
- 分辨率：1920x1080
- 时长：8 秒 (240 帧 @ 30fps)
- 可定制参数:
  - `productName`: 产品名称
  - `tagline`: 标语
  - `primaryColor`: 主色调
  - `secondaryColor`: 辅助色

**动画效果**:
- 旋转渐变背景
- 产品卡片缩放进入
- 产品名称渐变色 + 滑入
- 标语延迟滑入
- CTA 按钮脉冲动画

### 6. Thumbnail Template (缩略图模板)
**位置**: `thumbnails/ThumbnailTemplate`
- 分辨率：1280x720 (YouTube 缩略图)
- 类型：静态图片 (Still)
- 可定制参数:
  - `title`: 标题
  - `subtitle`: 副标题
  - `backgroundGradient`: 背景渐变色数组

## 🚀 使用指南

### 安装依赖

```bash
cd remotion-video-templates
npm install
```

### 预览模板

```bash
npm start
```

这将在浏览器中打开 Remotion Studio，可以预览所有模板。

### 渲染视频

```bash
# 渲染 IntroTemplate
npx remotion render IntroTemplate out/intro.mp4

# 渲染带自定义参数的视频
npx remotion render IntroTemplate out/intro-custom.mp4 --props "{\"title\":\"My Channel\",\"subtitle\":\"Subscribe Now\",\"backgroundColor\":\"#000000\",\"textColor\":\"#ffffff\"}"

# 渲染 SocialMediaPost
npx remotion render SocialMediaPost out/social.mp4 --props "{\"title\":\"Amazing Content\",\"description\":\"Check this out!\",\"accentColor\":\"#ff6b6b\"}"

# 渲染 ProductShowcase
npx remotion render ProductShowcase out/product.mp4 --props "{\"productName\":\"Awesome Product\",\"tagline\":\"The best choice\",\"primaryColor\":\"#6c5ce7\",\"secondaryColor\":\"#a29bfe\"}"
```

### 渲染缩略图

```bash
# 渲染静态缩略图
npx remotion still ThumbnailTemplate out/thumbnail.png --props "{\"title\":\"Video Title\",\"subtitle\":\"Engaging Subtitle\",\"backgroundGradient\":[\"#ff6b6b\",\"#ff8e53\"]}"
```

## 📁 项目结构

```
remotion-video-templates/
├── src/
│   ├── Root.tsx              # 模板入口，定义所有 Composition
│   ├── IntroTemplate.tsx     # 片头模板
│   ├── TypewriterTitle.tsx   # 打字机标题
│   ├── FadeTransition.tsx    # 渐变过渡
│   ├── SocialMediaPost.tsx   # 社交媒体帖子
│   ├── ProductShowcase.tsx   # 产品展示
│   └── ThumbnailTemplate.tsx # 缩略图模板
├── package.json
├── tsconfig.json
└── README.md
```

## 🎨 定制指南

### 修改颜色
所有模板都支持颜色定制，使用十六进制颜色代码：
- `#ff6b6b` - 珊瑚红
- `#4ecdc4` - 青绿色
- `#6c5ce7` - 紫罗兰
- `#a29bfe` - 淡紫色
- `#fd79a8` - 粉红色

### 修改时长
在 `Root.tsx` 中修改 `durationInFrames`:
```tsx
<Composition
  id="IntroTemplate"
  component={IntroTemplate}
  durationInFrames={150} // 修改这个值 (帧数 = 秒数 * 30)
  fps={30}
  // ...
/>
```

### 修改分辨率
在 `Root.tsx` 中修改 `width` 和 `height`:
```tsx
<Composition
  id="SocialMediaPost"
  component={SocialMediaPost}
  width={1080}  // Instagram 方形
  height={1080}
  // ...
/>
```

常用分辨率:
- 1920x1080: YouTube, 横版视频
- 1080x1920: TikTok, Instagram Stories, 竖版视频
- 1080x1080: Instagram 方形帖子
- 1280x720: YouTube 缩略图

## 💡 最佳实践

1. **性能优化**: 使用 `interpolate` 而不是 CSS 动画
2. **可复用性**: 所有参数都通过 props 传递
3. **类型安全**: 使用 TypeScript 接口定义 props
4. **响应式设计**: 使用百分比和相对单位
5. **平滑动画**: 使用适当的缓动函数

## 📝 技术栈

- **Remotion**: 视频渲染框架
- **React**: 组件化开发
- **TypeScript**: 类型安全
- **CSS-in-JS**: 内联样式

## 🎯 下一步

- [ ] 添加更多转场效果
- [ ] 添加 Lottie 动画支持
- [ ] 添加音频支持
- [ ] 添加字幕支持
- [ ] 创建模板预设库

## 📄 许可证

MIT License - 可自由使用于个人和商业项目

---

**钱包地址**: `RTC4325af95d26d59c3ef025963656d22af638bb96b`
**任务 ID**: #45
**价值**: 150 RTC / $15
