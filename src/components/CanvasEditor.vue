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
        class="absolute bg-black/90 border border-gray-600 rounded-lg p-2 shadow-xl z-50 min-w-40 backdrop-blur-md"
        :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
        @click.stop
      >
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click="removeBackground">
          <span class="mr-3 text-base w-5 text-center">🎨</span>
          去除背景
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click="aiEdit">
          <span class="mr-3 text-base w-5 text-center">✨</span>
          AI修图
        </div>
        <div class="flex items-center px-4 py-3 text-white cursor-pointer hover:bg-white/10 transition-colors text-sm" @click="closeContextMenu">
          <span class="mr-3 text-base w-5 text-center">❌</span>
          取消
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue'
import { Canvas, Text, Image, Circle } from 'fabric'

export default defineComponent({
  name: 'CanvasEditor',
  setup() {
    const canvasRef = ref<HTMLCanvasElement>()
    const fileInput = ref<HTMLInputElement>()
    const showContextMenu = ref(false)
    const contextMenuPosition = ref({ x: 0, y: 0 })
    let canvas: Canvas | null = null

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
              // 计算图片缩放比例以适应画布
              const canvasWidth = canvas?.getWidth() || 800
              const canvasHeight = canvas?.getHeight() || 600
              const imgWidth = img.width || 1
              const imgHeight = img.height || 1
              
              const scaleX = canvasWidth / imgWidth
              const scaleY = canvasHeight / imgHeight
              const scale = Math.min(scaleX, scaleY, 0.5) // 缩小到50%以适应多张图片
              
              img.scale(scale)
              
              // 随机分布图片位置，避免重叠
              const margin = 50
              const maxX = canvasWidth - imgWidth * scale - margin
              const maxY = canvasHeight - imgHeight * scale - margin
              
              img.set({
                left: Math.random() * Math.max(maxX, margin) + margin,
                top: Math.random() * Math.max(maxY, margin) + margin,
                selectable: true,
                evented: true,
                // 添加轻微的随机旋转
                angle: (Math.random() - 0.5) * 30
              })
              
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
    const removeBackground = () => {
      if (!canvas) return
      
      const activeObject = canvas.getActiveObject()
      if (activeObject && activeObject.type === 'image') {
        // 这里可以集成背景去除API
        alert('去除背景功能 - 需要集成AI服务')
        closeContextMenu()
      }
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
      const isMenu = target.closest('.context-menu')
      const isCanvas = target.closest('canvas')
      
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
      handleFileUpload,
      handleDrop,
      handleDragOver,
      handleDragEnter,
      handleContainerRightClick,
      handleCanvasRightClick,
      removeBackground,
      aiEdit,
      closeContextMenu
    }
  }
})
</script>
