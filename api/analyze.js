module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
    }

    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: '서버에 API 키가 없습니다. Vercel 환경변수를 확인해주세요.' });
    }

    if (!image) {
        return res.status(400).json({ error: '이미지가 전달되지 않았습니다.' });
    }

    try {
        const modelsToTry = [
            'gemini-2.5-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-flash'
        ];

        const prompt = `당신은 냉철하고 정확한 세계 최고의 손금 분석가입니다. 
주어진 손바닥 사진을 보고 3대 주요 선(생명선, 두뇌선, 감정선)과 종합 사주 풀이에 대한 결과를 분석해주세요.
좋은 말만 하지 말고, 긍정적인 부분(행운)과 부정적인 부분(불행 또는 주의할 점)을 모두 가감 없이 솔직하게 작성해주세요.`;

        let resultJson = null;
        let lastError = "";

        for (const model of modelsToTry) {
            try {
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                
                const payload = {
                    contents: [
                        {
                            role: "user",
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType: "image/jpeg", data: image } }
                            ]
                        }
                    ],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                lifeLine: { type: "STRING" },
                                headLine: { type: "STRING" },
                                heartLine: { type: "STRING" },
                                luckyPoint: { type: "STRING" },
                                unluckyPoint: { type: "STRING" },
                                summary: { type: "STRING" }
                            },
                            required: ["lifeLine", "headLine", "heartLine", "luckyPoint", "unluckyPoint", "summary"]
                        }
                    }
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`[${model}] 거절됨: ${errorText}`);
                }

                const responseData = await response.json(); 
                
                if (responseData.candidates && responseData.candidates.length > 0) {
                    // ★ 문제의 에러 코드를 완전히 삭제하고, 바로 깔끔하게 파싱합니다! ★
                    const jsonText = responseData.candidates[0].content.parts[0].text;
                    resultJson = JSON.parse(jsonText);
                    break;
                } else {
                    throw new Error(`[${model}] 응답 생성 실패`);
                }
            } catch (error) {
                console.warn(`모델 시도 실패: ${error.message}`);
                lastError = error.message;
            }
        }

        if (!resultJson) {
            throw new Error(`모든 AI 모델 접근 실패. (마지막 에러: ${lastError})`);
        }

        return res.status(200).json(resultJson);

    } catch (error) {
        console.error('백엔드 치명적 에러:', error);
        return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.', details: error.message });
    }
}
