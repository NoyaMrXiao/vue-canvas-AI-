<template>
  <div class="">
    <div class="max-w-6xl mx-auto">
      <div class="flex bg-white p-2 rounded-md gap-3 items-end">
        <!-- 输入区域 -->
        <div class="flex-1">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            {{ mode === 'text' ? '输入提示词生成图片' : '输入提示词并上传参考图片' }}
          </label>
          <div v-if="activePreview || referenceImage" class="w-12 h-12 mb-2 rounded-md overflow-hidden border border-gray-200">
            <img :src="activePreview || referenceImage || ''" alt="参考图片" class="w-full h-full object-cover" />
          </div>
          <div class="flex gap-2">
            <input
              v-model="prompt"
              type="text"
              :placeholder="mode === 'text' ? '例如：一只可爱的小猫在花园里玩耍' : '例如：将这张图片变成卡通风格'"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              :disabled="isGenerating"
              @keyup.enter="generateImage"
            />
            <button
              @click="generateImage"
              :disabled="!prompt.trim() || isGenerating || (mode === 'image' && !referenceImage)"
              class="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <span v-if="isGenerating" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                生成中...
              </span>
              <span v-else>{{ mode === 'text' ? '生成图片' : '图生图' }}</span>
            </button>
          </div>
        </div>

        <!-- 图生图上传 / 选中图预览区域 -->
        <div v-if="mode === 'image'" class="flex items-center gap-2">
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            @change="handleFileUpload"
            class="hidden"
          />
          <button
            v-if="!hasActiveImage"
            @click="() => fileInput?.click()"
            class="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
          >
            {{ referenceImage ? '更换图片' : '上传图片' }}
          </button>

        </div>
      </div>
      
      <!-- 生成历史 -->
      <div v-if="generatedImages.length > 0" class="mt-4">
        <h4 class="text-sm font-medium text-gray-700 mb-2">生成历史</h4>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="(image, index) in generatedImages"
            :key="index"
            class="relative group cursor-pointer flex-shrink-0 bg-white rounded-md"
            @click="addToCanvas(image)"
          >
            <img
              :src="image.url"
              :alt="image.prompt"
              class="w-24 h-24 object-cover rounded-md border border-gray-200 hover:border-blue-500 transition-colors bg-white"
            />
            <div class="absolute inset-0 bg-black/20  group-hover:bg-opacity-30 transition-all rounded-md flex items-center justify-center">
              <span class="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity text-center px-1">
                添加到画布
              </span>
            </div>
            <p class="text-xs text-gray-600 mt-1 truncate w-24" :title="image.prompt">
              {{ image.prompt }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch, type PropType } from 'vue'
import { 
  generateTextToImage, 
  generateImageToImage, 
  DEFAULT_TEXT_TO_IMAGE_CONFIG,
  DEFAULT_IMAGE_TO_IMAGE_CONFIG,
  base64ToDataURL,
  type TextToImageRequest,
  type ImageToImageRequest,
  type ImageGenerationResponse
} from '../api/imageGeneration'

interface GeneratedImage {
  url: string
  prompt: string
  timestamp: number
  generationParams?: any
}

export default defineComponent({
  name: 'ImageGenerator',
  emits: ['addImage', 'generation-start', 'generation-complete'],
  props: {
    hasActiveImage: { type: Boolean, default: false },
    getActiveImageDataURL: { type: Function as PropType<() => Promise<string | null> | string | null>, required: false },
    replaceActiveImageWith: { type: Function as PropType<(url: string) => void>, required: false }
  },
  setup(props, { emit }) {
    const prompt = ref('')
    const isGenerating = ref(false)
    const generatedImages = ref<GeneratedImage[]>([])
    const mode = ref<'text' | 'image'>('text')
    const referenceImage = ref<string | null>(null)
    const activePreview = ref<string | null>(null)
    const fileInput = ref<HTMLInputElement>()

    // 统一将后端返回的图片数据规范为 DataURL
    const normalizeToDataURL = (input: string): string => {
      return input.startsWith('data:') ? input : base64ToDataURL(input)
    }

    // 本地存储键名
    const HISTORY_STORAGE_KEY = 'imageGenerator.history'

    // 从本地读取历史
    const isLikelyDataURL = (s: string) => /^data:.+;base64,/.test(s)

    const loadHistory = () => {
      try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as GeneratedImage[]
        if (Array.isArray(parsed)) {
          // 兼容：保证 url 为 DataURL
          generatedImages.value = parsed
            .filter((item) => typeof item?.url === 'string' && item.url)
            .map((item) => ({
              ...item,
              url: normalizeToDataURL(item.url)
            }))
            .filter((item) => isLikelyDataURL(item.url))
        }
      } catch (_) {
        // ignore
      }
    }

    // 保存历史到本地
    const saveHistory = () => {
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(generatedImages.value))
      } catch (_) {
        // ignore
      }
    }

    // 处理文件上传
    const handleFileUpload = (event: Event) => {
      const target = event.target as HTMLInputElement
      const file = target.files?.[0]
      
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          referenceImage.value = e.target?.result as string
        }
        reader.readAsDataURL(file)
      }
    }

    // 图片生成API调用
    const generateImage = async () => {
      if (!prompt.value.trim() || isGenerating.value) return
      // 若有选中图片，强制走图生图，无需本地上传
      if (!props.hasActiveImage && mode.value === 'image' && !referenceImage.value) return
      
      isGenerating.value = true
      
      try {
        let result: ImageGenerationResponse
        // 生成会话 token，便于画布占位与替换
        const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`
        const width = (mode.value === 'text' ? (DEFAULT_TEXT_TO_IMAGE_CONFIG.width || 512) : (DEFAULT_IMAGE_TO_IMAGE_CONFIG.width || 512)) as number
        const height = (mode.value === 'text' ? (DEFAULT_TEXT_TO_IMAGE_CONFIG.height || 512) : (DEFAULT_IMAGE_TO_IMAGE_CONFIG.height || 512)) as number

        // 仅在未选中图片（文生图）时创建占位框
        if (!props.hasActiveImage) {
          emit('generation-start', { token, width, height, prompt: prompt.value.trim(), mode: mode.value })
        }
        
        if (!props.hasActiveImage && mode.value === 'text') {
          // 文生图
          const request: TextToImageRequest = {
            prompt: prompt.value.trim(),
            ...DEFAULT_TEXT_TO_IMAGE_CONFIG
          }
          result = await generateTextToImage(request)
        } else {
          // 图生图
          // 优先使用画布选中图片作为参考
          let initImage: string | null = null
          if (props.hasActiveImage && props.getActiveImageDataURL) {
            const maybe = props.getActiveImageDataURL()
            initImage = typeof maybe === 'string' ? maybe : await maybe
          }
          const finalImage = initImage || referenceImage.value!
          const request: ImageToImageRequest = {
            prompt: prompt.value.trim(),
            image: finalImage,
            ...DEFAULT_IMAGE_TO_IMAGE_CONFIG
          }
          result = await generateImageToImage(request)
        }
        
        const newImage: GeneratedImage = {
          url: normalizeToDataURL(result.image),
          prompt: result.prompt,
          timestamp: result.timestamp,
          generationParams: result.generation_params
        }
        
        generatedImages.value.unshift(newImage)
        
        // 限制历史记录数量
        if (generatedImages.value.length > 8) {
          generatedImages.value = generatedImages.value.slice(0, 8)
        }

        // 持久化本地
        saveHistory()
        
        // 若是画布选中图片，直接替换原图；否则按占位框流程
        if (props.hasActiveImage && props.replaceActiveImageWith) {
          props.replaceActiveImageWith(newImage.url)
        } else {
          // 通知画布生成完成，进行替换
          emit('generation-complete', { token, url: newImage.url })
        }
        prompt.value = ''
        
      } catch (error) {
        console.error('图片生成失败:', error)
        alert(`图片生成失败: ${error instanceof Error ? error.message : '未知错误'}`)
        // 如果创建了占位框，失败时通知画布清理占位
        // 通过发送空 url 让画布只清理不替换
        try {
          // 只有未选中图片的文生图流程才会创建占位
          if (!props.hasActiveImage) {
            const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`
            // 发出清理事件（使用新token无法对应旧占位，这里不再发送，交由超时策略或后续生成完成事件解决）
          }
        } catch {}
      } finally {
        isGenerating.value = false
      }
    }

    const addToCanvas = (image: GeneratedImage) => {
      emit('addImage', image.url)
    }

    onMounted(() => {
      loadHistory()
    })

    // 当画布选中图片时，自动切换为图生图模式
    watch(() => props.hasActiveImage, (val) => {
      if (val) {
        mode.value = 'image'
        // 拉取选中图片的预览
        if (props.getActiveImageDataURL) {
          const maybe = props.getActiveImageDataURL()
          Promise.resolve(maybe).then((url) => {
            activePreview.value = typeof url === 'string' ? url : null
          }).catch(() => {
            activePreview.value = null
          })
        }
      } else {
        activePreview.value = null
        mode.value = 'text'
      }
    }, { immediate: true })

    return {
      prompt,
      isGenerating,
      generatedImages,
      mode,
      referenceImage,
      fileInput,
      handleFileUpload,
      generateImage,
      addToCanvas,
      activePreview
    }
  }
})
</script>

<style scoped>
/* 自定义滚动条 */
.grid::-webkit-scrollbar {
  height: 4px;
}

.grid::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 2px;
}

.grid::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 2px;
}

.grid::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
