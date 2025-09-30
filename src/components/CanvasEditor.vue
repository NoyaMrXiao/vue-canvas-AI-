<template>
  <div class="relative w-screen h-screen overflow-hidden">
    <!-- 画布区域 -->
    <div class="absolute inset-0 bg-gray-900 select-none" @drop="handleDrop" @dragover="handleDragOver" @dragenter="handleDragEnter" @contextmenu="handleContainerRightClick">
      <canvas ref="canvasRef" class="block w-full h-full" @contextmenu="handleCanvasRightClick"></canvas>
      <input
        type="file"
        ref="fileInput"
        @change="handleFileUpload"
        accept="image/*"
        multiple
        class="hidden"
      />
      
      <!-- 右键菜单 -->
      <div 
        v-if="showContextMenu" 
        class="absolute bg-black/90 border border-gray-600 rounded-lg p-2 shadow-xl z-50 min-w-40 backdrop-blur-md context-menu"
        :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
        @click.stop
      >
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click.stop="handleRemoveBackground" :class="{ 'opacity-50 cursor-not-allowed': isProcessing }">
          <span class="mr-3 text-base w-5 text-center">
            <span v-if="isProcessing" class="animate-spin">⏳</span>
            <span v-else>🎨</span>
          </span>
          <span v-if="isProcessing">处理中...</span>
          <span v-else>去除背景</span>
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click.stop="handleCropImage">
          <span class="mr-3 text-base w-5 text-center">✂️</span>
          裁剪图片
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click.stop="downloadActiveImage">
          <span class="mr-3 text-base w-5 text-center">⬇️</span>
          下载图片
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click.stop="aiEdit">
          <span class="mr-3 text-base w-5 text-center">✨</span>
          AI修图
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click.stop="closeContextMenu">
          <span class="mr-3 text-base w-5 text-center">❌</span>
          取消
        </div>
      </div>
    </div>
    
    <!-- 图片生成组件 - 固定在底部 -->
    <div class="fixed bottom-8 left-0 right-0 z-40">
      <ImageGenerator 
        @add-image="handleAddGeneratedImage" 
        @generation-start="handleGenerationStart"
        @generation-complete="handleGenerationComplete"
        :has-active-image="hasActiveImage"
        :get-active-image-data-u-r-l="getActiveImageDataURL"
        :replace-active-image-with="replaceActiveImageWith"
      />
    </div>
  </div>

  <!-- 裁剪弹窗 -->
  <div v-if="showCropModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50" @click="closeCropModal">
    <div class="bg-white rounded-lg p-6 w-[90vw] h-[90vh] flex flex-col" @click.stop>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-800">裁剪图片</h3>
        <button @click="closeCropModal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>
      
      <!-- 裁剪区域 -->
      <div class="flex-1 flex flex-col">
        <h4 class="text-sm font-medium text-gray-600 mb-2">拖拽调整裁剪框，选择要保留的区域</h4>
        <div class="flex-1 border border-gray-300 rounded-lg overflow-hidden relative bg-gray-50">
          <canvas ref="cropCanvasRef" class="w-full h-full"></canvas>
        </div>
        
        <!-- 裁剪控制 -->
        <div class="mt-4 flex gap-2 justify-center">
          <button @click="confirmCrop" class="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors font-medium">
            确认裁剪
          </button>
          <button @click="closeCropModal" class="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors font-medium">
            取消
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'
import { Canvas, Text, Image, Circle, Rect, Gradient, Point } from 'fabric'
import { removeBackground } from '../api/backgroundRemoval'
import ImageGenerator from './ImageGenerator.vue'

export default defineComponent({
  name: 'CanvasEditor',
  components: {
    ImageGenerator
  },
  setup() {
    const canvasRef = ref<HTMLCanvasElement>()
    const fileInput = ref<HTMLInputElement>()
    const cropCanvasRef = ref<HTMLCanvasElement>()
    const showContextMenu = ref(false)
    const contextMenuPosition = ref({ x: 0, y: 0 })
    const isProcessing = ref(false)
    const showCropModal = ref(false)
    const cropImageData = ref<{ originalImage: string; imageObject: any } | null>(null)
    let canvas: Canvas | null = null
    // 提供给 ImageGenerator 的桥接：是否有选中图像
    const hasActiveImage = ref(false)
    let processingMask: any = null
    let processingAnimation: number | null = null
    let cropCanvas: Canvas | null = null
    // 生成占位框与动画管理
    const generationPlaceholders = new Map<string, { frame: Rect, label: Text }>()
    const generationAnimations = new Map<string, number>()

    onMounted(() => {
      if (canvasRef.value) {
        // 获取全屏尺寸
        const width = window.innerWidth
        const height = window.innerHeight
        
        canvas = new Canvas(canvasRef.value, {
          width: width,
          height: height,
          backgroundColor: '#0a0a0a'
        })
        
        // 创建星空背景
        createStarField()
        
        // 监听画布事件
        setupCanvasEvents()

        // 启用鼠标滚轮缩放
        setupWheelZoom()
        
        // 添加键盘事件监听
        document.addEventListener('keydown', handleKeyDown)
      }
    })

    onUnmounted(() => {
      if (canvas) {
        canvas.dispose()
      }
      // 清理键盘事件监听
      document.removeEventListener('keydown', handleKeyDown)
      // 停止所有生成动画
      generationAnimations.forEach((id) => cancelAnimationFrame(id))
      generationAnimations.clear()
    })


    // 创建星空背景
    const createStarField = () => {
      if (!canvas) return
      
      const width = canvas.getWidth()
      const height = canvas.getHeight()
      
      // 创建多个小圆点作为星星
      for (let i = 0; i < 200; i++) {
        const star = new Circle({
          left: Math.random() * width,
          top: Math.random() * height,
          radius: Math.random() * 2 + 0.5,
          fill: '#ffffff',
          opacity: Math.random() * 0.8 + 0.2,
          selectable: false,
          evented: false
        })
        canvas.add(star)
      }
      canvas.renderAll()
    }

    const handleFileUpload = (event: Event) => {
      const target = event.target as HTMLInputElement
      const files = target.files
      
      if (files && files.length > 0) {
        processMultipleFiles(Array.from(files))
      }
    }

    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
        if (imageFiles.length > 0) {
          processMultipleFiles(imageFiles)
        }
      }
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
    }

    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault()
    }

    // 处理添加生成的图片到画布
    const handleAddGeneratedImage = (imageUrl: string) => {
      if (!canvas) return
      
      Image.fromURL(imageUrl).then((img) => {
        if (img && canvas) {
          // 设置图片在画布中心
          img.set({
            left: canvas.getWidth() / 2,
            top: canvas.getHeight() / 2,
            originX: 'center',
            originY: 'center',
            scaleX: 0.5,
            scaleY: 0.5,
            selectable: true,
            evented: true
          })
          
          canvas.add(img)
          canvas.setActiveObject(img)
          canvas.renderAll()
          
          console.log('生成的图片已添加到画布')
        }
      }).catch((error) => {
        console.error('添加生成图片失败:', error)
        alert('添加图片失败，请重试')
      })
    }

    // 开始生成：在画布中心放置预填充画框并启动动画
    const handleGenerationStart = (payload: { token: string; width: number; height: number; prompt: string; mode: 'text' | 'image' }) => {
      if (!canvas) return
      const canvasWidth = canvas.getWidth()
      const canvasHeight = canvas.getHeight()

      // 目标显示区域：画布较短边的 50%
      const maxDisplayWidth = canvasWidth * 0.5
      const maxDisplayHeight = canvasHeight * 0.5
      const targetScale = Math.min(maxDisplayWidth / payload.width, maxDisplayHeight / payload.height, 1)
      const displayWidth = payload.width * targetScale
      const displayHeight = payload.height * targetScale

      const centerX = canvasWidth / 2
      const centerY = canvasHeight / 2

      const frame = new Rect({
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        width: displayWidth,
        height: displayHeight,
        fill: 'rgba(0,0,0,0.06)',
        stroke: '#60a5fa',
        strokeWidth: 3,
        strokeDashArray: [12, 8],
        rx: 8,
        ry: 8,
        selectable: false,
        evented: false
      })

      const label = new Text('生成中...', {
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fontSize: 20,
        fill: '#ffffff',
        selectable: false,
        evented: false
      })

      generationPlaceholders.set(payload.token, { frame, label })
      canvas.add(frame)
      canvas.add(label)
      frame.setCoords(); label.setCoords()
      canvas.renderAll()

      // 启动描边虚线流动动画
      let t = 0
      const animate = () => {
        t += 1.5
        frame.set({ strokeDashOffset: t })
        const alpha = 0.7 + Math.sin(t / 8) * 0.2
        label.set({ opacity: alpha })
        canvas?.renderAll()
        const id = requestAnimationFrame(animate)
        generationAnimations.set(payload.token, id)
      }
      const id = requestAnimationFrame(animate)
      generationAnimations.set(payload.token, id)
    }

    // 生成完成：用最终图片替换占位框
    const handleGenerationComplete = (payload: { token: string; url: string }) => {
      if (!canvas) return
      const placeholder = generationPlaceholders.get(payload.token)
      if (!placeholder) {
        // 若无占位，作为普通新增处理
        if (payload.url) return handleAddGeneratedImage(payload.url)
        return
      }

      // 停止动画并移除占位
      const animId = generationAnimations.get(payload.token)
      if (animId) cancelAnimationFrame(animId)
      generationAnimations.delete(payload.token)

      const { frame, label } = placeholder
      const targetLeft = frame.left || canvas.getWidth() / 2
      const targetTop = frame.top || canvas.getHeight() / 2
      const targetWidth = frame.width || 256
      const targetHeight = frame.height || 256

      Image.fromURL(payload.url).then((img) => {
        if (!img || !canvas) return
        const scaleX = targetWidth / (img.width || 1)
        const scaleY = targetHeight / (img.height || 1)
        img.set({
          left: targetLeft,
          top: targetTop,
          originX: 'center',
          originY: 'center',
          scaleX,
          scaleY,
          selectable: true,
          evented: true
        })

        canvas.remove(frame)
        canvas.remove(label)
        generationPlaceholders.delete(payload.token)

        canvas.add(img)
        canvas.setActiveObject(img)
        canvas.renderAll()
      }).catch((error) => {
        console.error('生成完成替换失败，降级为普通添加:', error)
        canvas?.remove(frame)
        canvas?.remove(label)
        generationPlaceholders.delete(payload.token)
        if (payload.url) handleAddGeneratedImage(payload.url)
      })
    }

    const processMultipleFiles = (files: File[]) => {
      if (!canvas) return
      
      // 如果是第一张图片，清空画布并重新创建星空背景
      if (canvas.getObjects().length === 0) {
        canvas.clear()
        createStarField()
      }
      
      let processedCount = 0
      const totalFiles = files.length
      
      files.forEach((file, index) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const imgUrl = e.target?.result as string
          
          Image.fromURL(imgUrl).then((img) => {
            if (img) {
              // 计算图片缩放比例以适应画布（单图90%，多图50%）
              const canvasWidth = canvas?.getWidth() || 800
              const canvasHeight = canvas?.getHeight() || 600
              const imgWidth = img.width || 1
              const imgHeight = img.height || 1
              
              const targetRatio = totalFiles === 1 ? 0.5 : 0.5
              const maxWidth = canvasWidth * targetRatio
              const maxHeight = canvasHeight * targetRatio
              const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1)
              
              img.scale(scale)
              
              if (totalFiles === 1) {
                // 单张图片：居中放置
                img.set({
                  left: (canvasWidth - imgWidth * scale) / 2,
                  top: (canvasHeight - imgHeight * scale) / 2,
                  selectable: true,
                  evented: true
                })
              } else {
                // 多张图片：随机分布，避免重叠
                const margin = 50
                const maxX = Math.max(canvasWidth - imgWidth * scale - margin, margin)
                const maxY = Math.max(canvasHeight - imgHeight * scale - margin, margin)
                img.set({
                  left: Math.random() * maxX,
                  top: Math.random() * maxY,
                  selectable: true,
                  evented: true,
                  angle: (Math.random() - 0.5) * 30
                })
              }
              
              canvas?.add(img)
              processedCount++
              
              // 当所有图片都处理完成后，重新渲染
              if (processedCount === totalFiles) {
                canvas?.renderAll()
              }
            }
          })
        }
        reader.readAsDataURL(file)
      })
    }

    // 设置画布事件监听
    const setupCanvasEvents = () => {
      if (!canvas) return
      
      console.log('设置画布事件监听')
      
      // 监听对象选择事件
      canvas.on('selection:created', (e) => {
        console.log('对象被选中:', e.selected)
        const obj = canvas?.getActiveObject()
        hasActiveImage.value = !!obj && obj.type === 'image'
      })
      // 监听选中对象更新（比如从一个对象切到另一个）
      canvas.on('selection:updated', (e) => {
        console.log('选中对象更新:', e.selected)
        const obj = canvas?.getActiveObject()
        hasActiveImage.value = !!obj && obj.type === 'image'
      })
      
      // 监听对象取消选择事件
      canvas.on('selection:cleared', () => {
        console.log('取消选择对象')
        closeContextMenu()
        hasActiveImage.value = false
      })
    }
    // 获取当前选中图片的 DataURL（用于图生图参考）
    const getActiveImageDataURL = (): string | null => {
      if (!canvas) return null
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        try {
          return (activeObject as any).toDataURL({ format: 'png', quality: 1, multiplier: 1 })
        } catch {
          return null
        }
      }
      return null
    }

    // 用新图片替换当前选中图片
    const replaceActiveImageWith = (imageUrl: string) => {
      if (!canvas) return
      const activeObject = canvas.getActiveObject()
      if (!activeObject || activeObject.type !== 'image') return

      const originalProps = {
        left: activeObject.left,
        top: activeObject.top,
        scaleX: activeObject.scaleX,
        scaleY: activeObject.scaleY,
        angle: activeObject.angle,
        originX: (activeObject as any).originX,
        originY: (activeObject as any).originY,
        width: (activeObject as any).width,
        height: (activeObject as any).height
      }

      Image.fromURL(imageUrl).then((newImg) => {
        if (!newImg || !canvas) return
        // 保持显示尺寸
        const originalDisplayWidth = (originalProps.width as number) * (originalProps.scaleX as number)
        const originalDisplayHeight = (originalProps.height as number) * (originalProps.scaleY as number)
        const newScaleX = originalDisplayWidth / (newImg.width || 1)
        const newScaleY = originalDisplayHeight / (newImg.height || 1)

        newImg.set({
          left: originalProps.left,
          top: originalProps.top,
          originX: originalProps.originX,
          originY: originalProps.originY,
          angle: originalProps.angle,
          scaleX: newScaleX,
          scaleY: newScaleY,
          selectable: true,
          evented: true
        })

        canvas.remove(activeObject)
        canvas.add(newImg)
        canvas.setActiveObject(newImg)
        canvas.renderAll()
      }).catch((err) => {
        console.error('替换选中图片失败:', err)
      })
    }

    // 鼠标滚轮缩放（以鼠标位置为中心缩放）
    const setupWheelZoom = () => {
      if (!canvas) return
      const MIN_ZOOM = 0.2
      const MAX_ZOOM = 4
      canvas.on('mouse:wheel', (opt: any) => {
        const event = opt.e as WheelEvent
        let zoom = canvas!.getZoom()
        // 使用指数缩放，使滚轮缩放更平滑
        const delta = event.deltaY
        const zoomFactor = 0.999 ** delta
        zoom *= zoomFactor
        if (zoom < MIN_ZOOM) zoom = MIN_ZOOM
        if (zoom > MAX_ZOOM) zoom = MAX_ZOOM

        const pointer = new Point(event.offsetX, event.offsetY)
        canvas!.zoomToPoint(pointer, zoom)
        event.preventDefault()
        event.stopPropagation()
      })
    }

    // 处理容器右键点击（阻止默认菜单）
    const handleContainerRightClick = (event: MouseEvent) => {
      console.log('容器右键点击')
      event.preventDefault()
      event.stopPropagation()
      
      if (!canvas) {
        console.log('画布未初始化')
        return
      }
      
      // 检查是否有选中的对象
      const activeObject = canvas.getActiveObject()
      console.log('容器右键 - 当前选中对象:', activeObject)
      
      if (activeObject && activeObject.type === 'image') {
        console.log('容器右键 - 选中了图片对象，显示菜单')
        // 获取鼠标位置
        const rect = canvasRef.value?.getBoundingClientRect()
        if (rect) {
          contextMenuPosition.value = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          }
          showContextMenu.value = true
          console.log('容器右键 - 菜单位置:', contextMenuPosition.value)
          console.log('容器右键 - 显示菜单:', showContextMenu.value)
        }
      } else {
        console.log('容器右键 - 没有选中图片对象，关闭菜单')
        closeContextMenu()
      }
    }

    // 处理画布右键点击
    const handleCanvasRightClick = (event: MouseEvent) => {
      console.log('画布右键点击')
      event.preventDefault()
      event.stopPropagation()
      
      if (!canvas) {
        console.log('画布未初始化')
        return
      }
      
      // 检查是否有选中的对象
      const activeObject = canvas.getActiveObject()
      console.log('当前选中对象:', activeObject)
      
      if (activeObject && activeObject.type === 'image') {
        console.log('选中了图片对象，显示菜单')
        // 获取鼠标位置
        const rect = canvasRef.value?.getBoundingClientRect()
        if (rect) {
          contextMenuPosition.value = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          }
          showContextMenu.value = true
          console.log('菜单位置:', contextMenuPosition.value)
          console.log('显示菜单:', showContextMenu.value)
        }
      } else {
        console.log('没有选中图片对象，关闭菜单')
        // 如果没有选中图片，关闭菜单
        closeContextMenu()
      }
    }

    // 去除背景功能
    const handleRemoveBackground = async () => {
      if (!canvas) return
      
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        try {
          // 点击后立即关闭菜单
          closeContextMenu()
          isProcessing.value = true
          console.log('开始去除背景...')
          
          // 保存原图片的属性
          const originalProps = {
            left: activeObject.left,
            top: activeObject.top,
            scaleX: activeObject.scaleX,
            scaleY: activeObject.scaleY,
            angle: activeObject.angle,
            width: activeObject.width,
            height: activeObject.height
          }
          
          // 添加处理中的蒙版效果
          addProcessingMask(activeObject)
          
          // 获取图片的DataURL
          const imageDataURL = activeObject.toDataURL({
            format: 'png',
            quality: 1,
            multiplier: 1
          })
          
          // 调用封装的背景移除API
          const result = await removeBackground(imageDataURL, 'image.png')
          
          console.log('背景移除成功')
          
          // 创建新的图片对象替换原图片
          Image.fromURL(result.image).then((newImg) => {
            if (newImg) {
              // 计算新的缩放比例以保持原始显示大小
              const originalDisplayWidth = originalProps.width * originalProps.scaleX
              const originalDisplayHeight = originalProps.height * originalProps.scaleY
              
              const newScaleX = originalDisplayWidth / newImg.width
              const newScaleY = originalDisplayHeight / newImg.height
              
              // 保持原图片的位置和显示大小
              newImg.set({
                left: originalProps.left,
                top: originalProps.top,
                scaleX: newScaleX,
                scaleY: newScaleY,
                angle: originalProps.angle,
                selectable: true,
                evented: true
              })
              
              // 移除原图片和蒙版，添加新图片
              canvas?.remove(activeObject)
              removeProcessingMask()
              canvas?.add(newImg)
              canvas?.renderAll()
              
              console.log('背景移除完成，图片已更新')
            }
          })
        } catch (error) {
          console.error('背景移除错误:', error)
          // 移除处理中的蒙版
          removeProcessingMask()
          alert(`背景移除失败: ${error instanceof Error ? error.message : '未知错误'}`)
        } finally {
          isProcessing.value = false
        }
      }
    }

    // 下载选中图片
    const downloadActiveImage = () => {
      if (!canvas) return
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        try {
          const dataURL = activeObject.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
          const link = document.createElement('a')
          link.download = 'image.png'
          link.href = dataURL
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        } catch (err) {
          console.error('下载图片失败:', err)
        } finally {
          closeContextMenu()
        }
      } else {
        // 若未选中图片则下载整个画布
        const dataURL = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
        const link = document.createElement('a')
        link.download = 'canvas.png'
        link.href = dataURL
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        closeContextMenu()
      }
    }

    // 添加处理中的蒙版效果
    const addProcessingMask = (imageObject: any) => {
      if (!canvas) return
      
      // 取消当前选中状态，避免选择高亮覆盖蒙版
      canvas.discardActiveObject()
      
      const displayWidth = Math.abs(imageObject.getScaledWidth?.() || imageObject.width * imageObject.scaleX)
      const displayHeight = Math.abs(imageObject.getScaledHeight?.() || imageObject.height * imageObject.scaleY)
      
      // 使用 Fabric 内置的中心点计算，兼容不同 originX/originY
      const center = imageObject.getCenterPoint ? imageObject.getCenterPoint() : { x: (imageObject.left || 0) + displayWidth / 2, y: (imageObject.top || 0) + displayHeight / 2 }
      
      const mask = new Rect({
        left: center.x,
        top: center.y,
        width: displayWidth,
        height: displayHeight,
        originX: 'center',
        originY: 'center',
        fill: new Gradient({
          type: 'radial',
          coords: { x1: displayWidth/2, y1: displayHeight/2, x2: displayWidth/2, y2: displayHeight/2, r1: 0, r2: Math.max(displayWidth, displayHeight)/2 },
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.9)' },
            { offset: 0.3, color: 'rgba(147, 51, 234, 0.7)' },
            { offset: 0.6, color: 'rgba(236, 72, 153, 0.5)' },
            { offset: 1, color: 'rgba(251, 191, 36, 0.3)' }
          ]
        }),
        opacity: 0.8,
        stroke: '#ffffff',
        strokeWidth: 3,
        strokeDashArray: [10, 5],
        selectable: false,
        evented: false,
        angle: imageObject.angle || 0
      })
      
      const text = new Text('AI 处理中...', {
        left: center.x,
        top: center.y,
        originX: 'center',
        originY: 'center',
        fontSize: 28,
        fontWeight: 'bold',
        fill: '#ffffff',
        textAlign: 'center',
        selectable: false,
        evented: false,
        angle: imageObject.angle || 0,
      })
      
      processingMask = { mask, text }
      canvas.add(mask)
      canvas.add(text)
      
      // 确保蒙版在最前面，使用更高的z-index
      if (typeof (mask as any).bringObjectToFront === 'function') {
        ;(mask as any).bringObjectToFront()
      }
      if (typeof (text as any).bringObjectToFront === 'function') {
        ;(text as any).bringObjectToFront()
      }
      
      // 强制设置蒙版为最高层级
      mask.set({ zIndex: 9999 })
      text.set({ zIndex: 10000 })
      
      mask.setCoords()
      text.setCoords()
      canvas.renderAll()
      
      startProcessingAnimation()
    }
    
    // 移除处理中的蒙版
    const removeProcessingMask = () => {
      if (!canvas || !processingMask) return
      
      canvas.remove(processingMask.mask)
      canvas.remove(processingMask.text)
      processingMask = null
      
      // 停止动画
      if (processingAnimation) {
        cancelAnimationFrame(processingAnimation)
        processingAnimation = null
      }
      canvas.renderAll()
    }
    
    // 开始处理动画
    const startProcessingAnimation = () => {
      if (!processingMask) return
      
      // 确保没有选中任何对象
      canvas?.discardActiveObject()
      
      let animationTime = 0
      const animate = () => {
        if (!processingMask) return
        
        animationTime += 0.05
        
        // 旋转动画
        const rotation = Math.sin(animationTime) * 0.1
        processingMask.mask.set({ angle: rotation })
        
        // 透明度呼吸效果
        const opacity = 0.6 + Math.sin(animationTime * 2) * 0.2
        processingMask.mask.set({ opacity })
        
        // 描边动画
        const dashOffset = animationTime * 10
        processingMask.mask.set({ strokeDashOffset: dashOffset })
        
        // 文本闪烁效果
        const textOpacity = 0.7 + Math.sin(animationTime * 3) * 0.3
        processingMask.text.set({ opacity: textOpacity })
        
        // 文本缩放效果
        const scale = 1 + Math.sin(animationTime * 1.5) * 0.1
        processingMask.text.set({ scaleX: scale, scaleY: scale })
        
        // 确保在最前面
        if (typeof (processingMask.mask as any).bringObjectToFront === 'function') {
          ;(processingMask.mask as any).bringObjectToFront()
        }
        if (typeof (processingMask.text as any).bringObjectToFront === 'function') {
          ;(processingMask.text as any).bringObjectToFront()
        }
        
        canvas?.renderAll()
        processingAnimation = requestAnimationFrame(animate)
      }
      
      animate()
    }

    // AI修图功能
    const aiEdit = () => {
      if (!canvas) return
      
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        // 这里可以集成AI修图API
        alert('AI修图功能 - 需要集成AI服务')
        closeContextMenu()
      }
    }

    // 关闭右键菜单
    const closeContextMenu = () => {
      console.log('关闭右键菜单')
      showContextMenu.value = false
    }

    // 点击其他地方关闭菜单
    const handleClickOutside = (event: MouseEvent) => {
      // 检查点击的目标是否是菜单或画布
      const target = event.target as HTMLElement
      const isMenu = target.closest('.context-menu') // 检查是否是右键菜单
      const isCanvas = target.closest('canvas')
      
      console.log('点击目标:', target)
      console.log('是菜单:', isMenu)
      console.log('是画布:', isCanvas)
      
      if (showContextMenu.value && !isMenu && !isCanvas) {
        console.log('点击外部，关闭菜单')
        closeContextMenu()
      }
    }

    // 全局禁用右键菜单的处理函数
    const handleGlobalContextMenu = (e: Event) => {
      e.preventDefault()
    }

    // 裁剪图片功能
    const handleCropImage = () => {
      if (!canvas) return
      
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        closeContextMenu()
        openCropModal(activeObject)
      }
    }

    // 打开裁剪弹窗
    const openCropModal = (imageObject: any) => {
      const imageDataURL = imageObject.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1
      })
      
      cropImageData.value = {
        originalImage: imageDataURL,
        imageObject: imageObject
      }
      showCropModal.value = true
      
      // 等待DOM更新后初始化裁剪画布
      setTimeout(() => {
        initCropCanvas(imageObject)
      }, 100)
    }

    // 初始化裁剪画布
    const initCropCanvas = (imageObject: any) => {
      if (!cropCanvasRef.value) return
      
      const canvasElement = cropCanvasRef.value
      const rect = canvasElement.getBoundingClientRect()
      
      // 设置画布尺寸为容器的实际尺寸
      const canvasWidth = rect.width
      const canvasHeight = rect.height
      
      cropCanvas = new Canvas(canvasElement, {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: '#f8f9fa'
      })
      
      // 添加图片到裁剪画布
      Image.fromURL(cropImageData.value?.originalImage || '').then((img) => {
        if (img && cropCanvas) {
          // 计算图片在画布中的合适大小，留出更多边距
          const padding = 20
          const maxWidth = canvasWidth - padding * 2
          const maxHeight = canvasHeight - padding * 2
          const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1)
          
          img.set({
            left: canvasWidth / 2,
            top: canvasHeight / 2,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true
          })
          
          cropCanvas.add(img)
          
          // 创建裁剪框，初始覆盖整个图片
          const cropRect = new Rect({
            left: img.left - img.width * img.scaleX / 2,
            top: img.top - img.height * img.scaleY / 2,
            width: img.width * img.scaleX,
            height: img.height * img.scaleY,
            fill: 'rgba(0, 255, 0, 0.1)',
            stroke: '#00ff00',
            strokeWidth: 3,
            strokeDashArray: [8, 4],
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true,
            lockRotation: true,
            lockScalingFlip: true,
            cornerColor: '#00ff00',
            cornerSize: 12,
            transparentCorners: false,
            borderColor: '#00ff00',
            borderScaleFactor: 3,
            cornerStyle: 'circle'
          })
          
          cropCanvas.add(cropRect)
          cropCanvas.setActiveObject(cropRect)
          cropCanvas.renderAll()
        }
      })
    }

    // 关闭裁剪弹窗
    const closeCropModal = () => {
      showCropModal.value = false
      cropImageData.value = null
      if (cropCanvas) {
        cropCanvas.dispose()
        cropCanvas = null
      }
    }

    // 确认裁剪
    const confirmCrop = () => {
      if (!cropCanvas || !cropImageData.value) return
      
      const activeObject = cropCanvas.getActiveObject()
      if (activeObject && activeObject.type === 'rect') {
        const imageObject = cropCanvas.getObjects().find(obj => obj.type === 'image')
        if (imageObject) {
          executeCropFromModal(imageObject, activeObject)
        }
      }
    }

    // 从弹窗执行裁剪
    const executeCropFromModal = (imageObject: any, cropRect: any) => {
      if (!canvas || !cropImageData.value) return
      
      try {
        // 计算裁剪区域相对于图片的位置
        const imageLeft = imageObject.left - imageObject.width * imageObject.scaleX / 2
        const imageTop = imageObject.top - imageObject.height * imageObject.scaleY / 2
        
        const cropLeft = (cropRect.left - imageLeft) / imageObject.scaleX
        const cropTop = (cropRect.top - imageTop) / imageObject.scaleY
        const cropWidth = cropRect.width / imageObject.scaleX
        const cropHeight = cropRect.height / imageObject.scaleY
        
        // 创建新的裁剪后的图片
        const croppedCanvas = document.createElement('canvas')
        const ctx = croppedCanvas.getContext('2d')
        
        if (!ctx) return
        
        croppedCanvas.width = cropWidth
        croppedCanvas.height = cropHeight
        
        // 绘制裁剪后的图片
        ctx.drawImage(
          imageObject.getElement(),
          cropLeft, cropTop, cropWidth, cropHeight,
          0, 0, cropWidth, cropHeight
        )
        
        // 创建新的图片对象
        const croppedDataURL = croppedCanvas.toDataURL('image/png')
        
        Image.fromURL(croppedDataURL).then((newImg) => {
          if (newImg && canvas) {
            // 获取原图片的位置和大小
            const originalImg = cropImageData.value?.imageObject
            if (originalImg) {
              // 设置新图片的位置和大小
              newImg.set({
                left: (originalImg.left || 0) + 10,
                top: (originalImg.top || 0) + 10,
                scaleX: originalImg.scaleX,
                scaleY: originalImg.scaleY,
                angle: originalImg.angle,
                originX: originalImg.originX,
                originY: originalImg.originY,
                selectable: true,
                evented: true
              })
              
              // 仅添加新图片，不移除原图片
              canvas.add(newImg)
              canvas.setActiveObject(newImg)
              canvas.renderAll()
              
              console.log('图片裁剪完成')
            }
          }
        })
        
        closeCropModal()
        
      } catch (error) {
        console.error('裁剪失败:', error)
        alert('裁剪失败，请重试')
      }
    }


    // 键盘事件处理函数
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!canvas) return
      // 当焦点在可编辑元素上（如输入框）时，不处理删除逻辑
      const target = event.target as HTMLElement | null
      if (target) {
        const isInputLike = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || !!target.closest('input, textarea, [contenteditable="true"]')
        if (isInputLike) {
          return
        }
      }
      
      // 检查是否按下了Delete键或Backspace键
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const activeObject = canvas.getActiveObject()
        
        if (activeObject) {
          // 如果有选中的对象，删除它
          canvas.remove(activeObject)
          canvas.renderAll()
          console.log('已删除选中对象')
        } else {
          // 如果没有选中对象，删除最后一个添加的对象
          const objects = canvas.getObjects()
          if (objects.length > 0) {
            const lastObject = objects[objects.length - 1]
            if (lastObject) {
              canvas.remove(lastObject)
            }
            canvas.renderAll()
            console.log('已删除最后一个对象')
          }
        }
        
        // 关闭右键菜单（如果打开的话）
        closeContextMenu()
      }
    }

    // 监听全局点击事件
    onMounted(() => {
      document.addEventListener('mousedown', handleClickOutside)
      // 全局禁用右键菜单
      document.addEventListener('contextmenu', handleGlobalContextMenu)
    })

    onUnmounted(() => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('contextmenu', handleGlobalContextMenu)
    })

    return {
      canvasRef,
      fileInput,
      cropCanvasRef,
      showContextMenu,
      contextMenuPosition,
      isProcessing,
      showCropModal,
      cropImageData,
      handleFileUpload,
      handleDrop,
      handleDragOver,
      handleDragEnter,
      handleContainerRightClick,
      handleCanvasRightClick,
      handleRemoveBackground,
      handleCropImage,
      closeCropModal,
      confirmCrop,
      downloadActiveImage,
      aiEdit,
      closeContextMenu,
      handleAddGeneratedImage,
      handleGenerationStart,
      handleGenerationComplete,
      hasActiveImage,
      getActiveImageDataURL,
      replaceActiveImageWith
    }
  }
})
</script>
