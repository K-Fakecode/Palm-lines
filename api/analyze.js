module.exports = async function handler(req, res) {
  // POST 요청만 받기
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
    }

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
    }

    const prompt = `당신은 냉철하고 정확한 세계 최고의 손금 분석가입니다. 
    주어진 손바닥 사진을 보고 다음 JSON 형식에 맞춰서 분석 결과를 한국어로 작성해주세요.
    좋은 말만 하지 말고, 손금에서 보이는 긍정적인 부분(행운)과 부정적인 부분(불행 또는 주의할 점)을 모두 가감 없이 솔직하게 작성해주세요.
    반드시 JSON 형식으로만 응답해야 합니다. 마크다운 기호(\`\`\`json)는 절대 포함하지 마세요.
    {
      "lifeLine": "생명선(건강, 체력) 분석 내용...",
      "headLine": "두뇌선(지능, 적성) 분석 내용...",
      "heartLine": "감정선(성격, 연애) 분석 내용...",
      "luckyPoint": "이 손금이 가진 최고의 행운 포인트 (재물, 귀인 등)...",
      "unluckyPoint": "이 손금에서 가장 조심해야 할 불행/주의 포인트 (사고, 건강, 배신 등)...",
      "summary": "종합 사주 풀이 내용..."
    }`;

    // ★ [핵심 수정] 구글이 확실하게 인식하는 풀네임(-latest)으로 변경
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    
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
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("API 에러 상세:", errorText);
      throw new Error(`구글 AI 에러: ${geminiResponse.status} - ${errorText}`);
    }

    const data = await geminiResponse.json();
    let resultText = data.candidates[0].content.parts[0].text;
    resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const resultJson = JSON.parse(resultText);

    return res.status(200).json(resultJson);

  } catch (error) {
    console.error('백엔드 에러:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
