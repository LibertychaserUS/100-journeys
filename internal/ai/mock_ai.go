package ai

import (
	"context"
	"strings"

	"github.com/100-journeys/app/internal/model"
)

type Provider interface {
	Chat(ctx context.Context, sessionID, message string) (string, []model.AIAction, error)
}

type MockAI struct{}

func NewMockAI() *MockAI {
	return &MockAI{}
}

func (m *MockAI) Chat(ctx context.Context, sessionID, message string) (string, []model.AIAction, error) {
	msg := strings.ToLower(message)

	// Recommendation request
	if strings.Contains(msg, "推荐") || strings.Contains(msg, "想去") || strings.Contains(msg, "建议") {
		action := model.AIAction{
			Type: "recommend",
			Data: map[string]interface{}{
				"reason": "根据你的兴趣，我为你挑选了以下不可思议的旅行体验...",
			},
		}
		return "为你找到了一些可能感兴趣的旅程！", []model.AIAction{action}, nil
	}

	// MBTI / personality quiz
	if strings.Contains(msg, "性格") || strings.Contains(msg, "mbti") || strings.Contains(msg, "我是") {
		action := model.AIAction{
			Type: "mbti_quiz",
			Data: map[string]interface{}{
				"questions": []map[string]interface{}{
					{
						"id":       1,
						"question": "在一个陌生的城市，你更倾向于：",
						"options": []map[string]string{
							{"value": "E", "text": "走进热闹的市集，和当地人聊天"},
							{"value": "I", "text": "独自探索安静的小巷和咖啡馆"},
						},
					},
					{
						"id":       2,
						"question": "面对旅行中的突发状况，你通常：",
						"options": []map[string]string{
							{"value": "S", "text": "立即寻找实际可行的解决方案"},
							{"value": "N", "text": "把这看作一次意想不到的冒险"},
						},
					},
					{
						"id":       3,
						"question": "选择旅行目的地时，什么最吸引你？",
						"options": []map[string]string{
							{"value": "F", "text": "能触动内心、产生共鸣的地方"},
							{"value": "T", "text": "有独特地理或历史价值的地方"},
						},
					},
				},
			},
		}
		return "让我通过几个问题，了解你的旅行性格类型！", []model.AIAction{action}, nil
	}

	// Greeting
	if strings.Contains(msg, "你好") || strings.Contains(msg, "hi") || strings.Contains(msg, "hello") {
		return "你好！我是你的旅行向导宠物，可以推荐不可思议的旅行体验！", nil, nil
	}

	// Risk / difficulty info
	if strings.Contains(msg, "难") || strings.Contains(msg, "危险") || strings.Contains(msg, "风险") {
		action := model.AIAction{
			Type: "info",
			Data: map[string]interface{}{
				"topic": "risk_levels",
				"levels": []map[string]interface{}{
					{"level": 1, "label": "休闲", "description": "适合所有人，无需特殊准备"},
					{"level": 2, "label": "轻度", "description": "需要基本体能，适合大多数旅行者"},
					{"level": 3, "label": "中等", "description": "需要一定经验和体能准备"},
					{"level": 4, "label": "挑战", "description": "需要专业技能和充分准备"},
					{"level": 5, "label": "极限", "description": "高风险，仅适合资深探险者"},
				},
			},
		}
		return "我们的旅程按风险等级分为1-5级，让我为你详细介绍一下：", []model.AIAction{action}, nil
	}

	// Default fallback
	return "我不太理解，你可以说'推荐旅行'、'测性格'或'你好'", nil, nil
}
