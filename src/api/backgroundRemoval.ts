/**
 * 背景移除API服务
 */

export interface BackgroundRemovalResponse {
  success: boolean
  image: string
  filename: string
}

export interface BackgroundRemovalError {
  error: string
  message: string
}

/**
 * 将DataURL转换为Blob
 */
export const dataURLToBlob = (dataURL: string): Promise<Blob> => {
  return fetch(dataURL).then(response => response.blob())
}

/**
 * 上传图片并移除背景
 * @param imageDataURL 图片的DataURL
 * @param filename 文件名
 * @returns Promise<BackgroundRemovalResponse>
 */
export const removeBackground = async (
  imageDataURL: string, 
  filename: string = 'image.png'
): Promise<BackgroundRemovalResponse> => {
  try {
    // 将DataURL转换为Blob
    const blob = await dataURLToBlob(imageDataURL)
    
    // 创建FormData
    const formData = new FormData()
    formData.append('file', blob, filename)
    
    // 调用背景移除API
    const response = await fetch('http://localhost:8080/api/upload', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || '背景移除失败')
    }
    
    return result
  } catch (error) {
    console.error('背景移除API错误:', error)
    throw error
  }
}

/**
 * 批量移除背景
 * @param imageDataURLs 图片DataURL数组
 * @returns Promise<BackgroundRemovalResponse[]>
 */
export const batchRemoveBackground = async (
  imageDataURLs: string[]
): Promise<BackgroundRemovalResponse[]> => {
  const promises = imageDataURLs.map((dataURL, index) => 
    removeBackground(dataURL, `image_${index}.png`)
  )
  
  return Promise.all(promises)
}

/**
 * 检查API是否可用
 * @returns Promise<boolean>
 */
export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/health', {
      method: 'GET'
    })
    return response.ok
  } catch {
    return false
  }
}
