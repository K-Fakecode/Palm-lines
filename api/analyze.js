export default async function handler(req, res) {
  // POST 요청만 받기
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  try {
    // 1. Vercel 환경 변수에서 API 키 가져오기
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("🚨 Vercel 환경변수에 API 키가 없습니다!");
      return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
    }

    // 2. 프론트엔드에서 보낸 사진 데이터 받기
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
    }

    console.log("✅ 프론트엔드에서 사진을 무사히 받았습니다냥!");

    // 3. AI에게 내릴 명령(프롬프트) 작성
    const prompt = `당신은 세계 최고의 손금 분석가입니다. 
    주어진 손바닥 사진을 보고 다음 JSON 형식에 맞춰서 분석 결과를 한국어로 작성해주세요.
    반드시 JSON 형식으로만 응답해야 합니다. 마크다운 기호(\`\`\`json)는 절대 포함하지 마세요.
    {
      "lifeLine": "생명선(건강, 체력) 분석 내용...",
      "headLine": "두뇌선(지능, 적성) 분석 내용...",
      "heartLine": "감정선(성격, 연애) 분석 내용...",
      "summary": "종합 사주 풀이 내용..."
    }`;

    // 4. 구글 Gemini AI(1.5 Flash 모델)에게 사진과 프롬프트 보내기
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    console.log("🚀 구글 Gemini에게 손금 분석을 요청합니다냥...");

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: image } }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json" // AI가 무조건 JSON 형태로 대답하게 강제
        }
      })
    });

    // ★ [핵심] 구글 AI가 에러를 뱉었을 때, 진짜 이유를 로그에 남기도록 수정
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("🚨 구글 AI가 화를 냅니다냥!! 상세 이유:", errorText);
      throw new Error(`구글 AI 거절: ${geminiResponse.status} - ${errorText}`);
    }

    // 5. 결과 파싱 및 프론트엔드로 전달
    const data = await geminiResponse.json();
    console.log("🎉 구글 AI 분석 완료!");
    
    let resultText = data.candidates[0].content.parts[0].text;
    
    // 혹시 모를 마크다운 찌꺼기 제거
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const resultJson = JSON.parse(resultText);

    return res.status(200).json(resultJson);

  } catch (error) {
    // 주방장이 쓰러지면 Vercel Logs에 붉은 글씨로 남기기
    console.error('🔥 백엔드 주방장 기절 (Backend Error):', error.message);
    return res.status(500).json({ error: error.message });
  }
}
