/**
 * 图片生成API服务
 */

export interface TextToImageRequest {
  prompt: string
  num_inference_steps?: number
  guidance_scale?: number
  width?: number
  height?: number
}

export interface ImageToImageRequest {
  prompt: string
  image: string // base64或DataURL
  num_inference_steps?: number
  strength?: number
  guidance_scale?: number
  width?: number
  height?: number
}

export interface ImageGenerationResponse {
  success: boolean
  image: string // base64图片数据
  prompt: string
  timestamp: number
  generation_params: {
    num_inference_steps: number
    guidance_scale: number
    strength?: number
    width: number
    height: number
  }
}

export interface ImageGenerationError {
  error: string
  message: string
  code?: string
}

/**
 * 将DataURL转换为base64
 */
export const dataURLToBase64 = (dataURL: string): string => {
  const parts = dataURL.split(',')
  if (parts.length < 2) {
    throw new Error('无效的DataURL格式')
  }
  return parts[1]
}

/**
 * 将base64转换为DataURL
 */
export const base64ToDataURL = (base64: string, mimeType: string = 'image/png'): string => {
  return `data:${mimeType};base64,${base64}`
}

/**
 * 文生图API
 * @param request 文生图请求参数
 * @returns Promise<ImageGenerationResponse>
 */
export const generateTextToImage = async (
  request: TextToImageRequest
): Promise<ImageGenerationResponse> => {
  try {
    const payload = {
      prompt: request.prompt,
      num_inference_steps: request.num_inference_steps || 1,
      guidance_scale: request.guidance_scale || 0.0,
      width: request.width || 512,
      height: request.height || 512
    }

    const response = await fetch('http://localhost:8080/api/text-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || '文生图生成失败')
    }

    if (!result.image) {
      throw new Error('API返回的图片数据为空')
    }

    return {
      success: true,
      image: result.image,
      prompt: request.prompt,
      timestamp: Date.now(),
      generation_params: {
        num_inference_steps: payload.num_inference_steps,
        guidance_scale: payload.guidance_scale,
        width: payload.width,
        height: payload.height
      }
    }
  } catch (error) {
    console.error('文生图API错误:', error)
    throw error
  }
}

/**
 * 图生图API
 * @param request 图生图请求参数
 * @returns Promise<ImageGenerationResponse>
 */
export const generateImageToImage = async (
  request: ImageToImageRequest
): Promise<ImageGenerationResponse> => {
  try {
    // 确保strength * num_inference_steps >= 1
    const numInferenceSteps = request.num_inference_steps || 2
    const strength = request.strength || 0.5
    
    if (numInferenceSteps * strength < 1) {
      throw new Error('num_inference_steps * strength 必须大于等于1')
    }

    const payload = {
      prompt: request.prompt,
      image: dataURLToBase64(request.image),
      num_inference_steps: numInferenceSteps,
      strength: strength,
      guidance_scale: request.guidance_scale || 0.0,
      width: request.width || 512,
      height: request.height || 512
    }

    const response = await fetch('http://localhost:8080/api/image-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || '图生图生成失败')
    }

    if (!result.image) {
      throw new Error('API返回的图片数据为空')
    }

    return {
      success: true,
      image: result.image,
      prompt: request.prompt,
      timestamp: Date.now(),
      generation_params: {
        num_inference_steps: numInferenceSteps,
        guidance_scale: payload.guidance_scale,
        strength: strength,
        width: payload.width,
        height: payload.height
      }
    }
  } catch (error) {
    console.error('图生图API错误:', error)
    throw error
  }
}

/**
 * 检查图片生成API是否可用
 * @returns Promise<boolean>
 */
export const checkImageGenerationApiHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch('http://localhost:8080/api/image-generation/health', {
      method: 'GET'
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * 获取支持的模型列表
 * @returns Promise<string[]>
 */
export const getAvailableModels = async (): Promise<string[]> => {
  try {
    const response = await fetch('/api/image-generation/models', {
      method: 'GET'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const result = await response.json()
    return result.models || []
  } catch (error) {
    console.error('获取模型列表失败:', error)
    return []
  }
}

/**
 * 默认的文生图配置
 */
export const DEFAULT_TEXT_TO_IMAGE_CONFIG: Partial<TextToImageRequest> = {
  num_inference_steps: 1,
  guidance_scale: 0.0,
  width: 512,
  height: 512
}

/**
 * 默认的图生图配置
 */
export const DEFAULT_IMAGE_TO_IMAGE_CONFIG: Partial<ImageToImageRequest> = {
  num_inference_steps: 2,
  strength: 0.5,
  guidance_scale: 0.0,
  width: 512,
  height: 512
}
