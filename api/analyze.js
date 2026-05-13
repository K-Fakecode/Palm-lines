module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API 키가 없습니다.' });
    }

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: '이미지가 없습니다.' });
    }

    const prompt = `당신은 냉철하고 정확한 세계 최고의 손금 분석가입니다. 
    주어진 손바닥 사진을 보고 다음 JSON 형식에 맞춰서 분석 결과를 한국어로 작성해주세요.
    좋은 말만 하지 말고, 긍정적인 부분(행운)과 부정적인 부분(불행 또는 주의할 점)을 모두 가감 없이 솔직하게 작성해주세요.
    반드시 JSON 형식으로만 응답해야 합니다. 마크다운 기호(\`\`\`json)는 절대 포함하지 마세요.
    {
      "lifeLine": "생명선(건강, 체력) 분석 내용...",
      "headLine": "두뇌선(지능, 적성) 분석 내용...",
      "heartLine": "감정선(성격, 연애) 분석 내용...",
      "luckyPoint": "이 손금이 가진 최고의 행운 포인트 (재물, 귀인 등)...",
      "unluckyPoint": "이 손금에서 가장 조심해야 할 불행/주의 포인트 (사고, 건강, 배신 등)...",
      "summary": "종합 사주 풀이 내용..."
    }`;

    // ★ [핵심 기능] 구글 AI 모델 문을 순서대로 다 두드려보는 만능 키!
    const modelsToTry = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro'
    ];

    let resultJson = null;
    let lastError = "";

    // 4개의 모델을 순서대로 테스트합니다.
    for (const model of modelsToTry) {
      console.log(`🚀 [${model}] 모델 문 두드리는 중...`);
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

        // 만약 이 모델이 404 에러로 거절하면 에러를 던지고 다음 모델로 넘어갑니다.
        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          throw new Error(`[${model}] 거절됨: ${errText}`);
        }

        // 문이 열리고 성공하면 결과를 파싱합니다.
        const data = await geminiResponse.json();
        let resultText = data.candidates[0].content.parts[0].text;
        resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        resultJson = JSON.parse(resultText);
        
        console.log(`✅ [${model}] 모델로 분석 완벽 성공!`);
        break; // 성공했으니 더 이상 다른 문을 두드릴 필요 없이 종료!

      } catch (error) {
        console.warn(error.message); // 거절된 기록을 로그에 남김
        lastError = error.message;
      }
    }

    // 4개 모델이 전부 거절했을 경우 최후의 에러 처리
    if (!resultJson) {
      throw new Error(`모든 AI 모델 접근 실패. 구글 API 키를 새로 발급받아야 합니다. (마지막 에러: ${lastError})`);
    }

    return res.status(200).json(resultJson);

  } catch (error) {
    console.error('🔥 최종 백엔드 에러:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
