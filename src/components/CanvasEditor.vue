<template>
  <div class="fixed top-0 left-0 w-screen h-screen m-0 p-0 overflow-hidden">
    <div class="relative w-full h-full bg-gray-900 select-none" @drop="handleDrop" @dragover="handleDragOver" @dragenter="handleDragEnter" @contextmenu="handleContainerRightClick">
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
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'
import { Canvas, Text, Image, Circle, Rect } from 'fabric'
import { removeBackground } from '../api/backgroundRemoval'

export default defineComponent({
  name: 'CanvasEditor',
  setup() {
    const canvasRef = ref<HTMLCanvasElement>()
    const fileInput = ref<HTMLInputElement>()
    const showContextMenu = ref(false)
    const contextMenuPosition = ref({ x: 0, y: 0 })
    const isProcessing = ref(false)
    let canvas: Canvas | null = null
    let processingMask: any = null
    let processingAnimation: number | null = null

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
      }
    })

    onUnmounted(() => {
      if (canvas) {
        canvas.dispose()
      }
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
      })
      
      // 监听对象取消选择事件
      canvas.on('selection:cleared', () => {
        console.log('取消选择对象')
        closeContextMenu()
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
        fill: '#ff0000',
        opacity: 1,
        stroke: '#ffffff',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        angle: imageObject.angle || 0
      })
      
      const text = new Text('处理中...', {
        left: center.x,
        top: center.y,
        originX: 'center',
        originY: 'center',
        fontSize: 20,
        fill: 'white',
        textAlign: 'center',
        selectable: false,
        evented: false,
        angle: imageObject.angle || 0
      })
      
      processingMask = { mask, text }
      canvas.add(mask)
      canvas.add(text)
      // 确保在最前面（Fabric v6 使用对象方法）
      if (typeof (mask as any).bringToFront === 'function') {
        ;(mask as any).bringToFront()
      }
      if (typeof (text as any).bringToFront === 'function') {
        ;(text as any).bringToFront()
      }
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
      
      // Debug: 保持纯红并在最前
      processingMask.mask.set({ fill: '#ff0000', opacity: 1 })
      if (typeof (processingMask.mask as any).bringToFront === 'function') {
        ;(processingMask.mask as any).bringToFront()
      }
      if (typeof (processingMask.text as any).bringToFront === 'function') {
        ;(processingMask.text as any).bringToFront()
      }
      canvas?.renderAll()
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
      showContextMenu,
      contextMenuPosition,
      isProcessing,
      handleFileUpload,
      handleDrop,
      handleDragOver,
      handleDragEnter,
      handleContainerRightClick,
      handleCanvasRightClick,
      handleRemoveBackground,
      downloadActiveImage,
      aiEdit,
      closeContextMenu
    }
  }
})
</script>
