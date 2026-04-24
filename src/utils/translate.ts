import type { YoudaoResult } from '../types'

const API_URL = '/translate'

export async function translate(text: string): Promise<YoudaoResult> {
  try {
    const response = await fetch(`${API_URL}?q=${encodeURIComponent(text)}`)
    return await response.json()
  } catch (error) {
    return {
      code: 1,
      msg: '翻译服务暂不可用',
      translation: ['翻译服务暂不可用']
    }
  }
}