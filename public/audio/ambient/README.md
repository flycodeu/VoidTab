# 氛围音音频文件

此目录存放「内置氛围音」中**文件式**音色的音频。白/粉/棕噪音由 Web Audio 程序生成，
不需要文件；以下文件式音色需要你放入可商用 / CC0 授权的循环音频后才会发声：

| 文件名          | 音色   |
|-----------------|--------|
| `rain.mp3`      | 雨声   |
| `cafe.mp3`      | 咖啡馆 |
| `waves.mp3`     | 海浪   |
| `fireplace.mp3` | 壁炉   |
| `lofi.mp3`      | Lo-Fi  |

要求：
- 30~60s 无缝循环，高压缩，单条建议 < 300KB，整组 < 2MB，避免拖大扩展包体。
- 格式用 `.mp3`（兼容性最好）或 `.ogg`/`.opus`（体积更小，需同步改 `src/features/audio/ambientSounds.ts` 中的 `file` 字段）。
- 素材授权见设计文档「开放问题」一节：务必使用可商用或 CC0 来源。

文件名/列表对应关系在 `src/features/audio/ambientSounds.ts` 中维护。
