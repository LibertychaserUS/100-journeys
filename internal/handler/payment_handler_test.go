package handler

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// IT-API-PAY-001: recharge tiers are public and carry the bonus each tier grants.
func TestPayment_Tiers(t *testing.T) {
	r, _, _, _ := setupOrderPaymentTestRouter(t)

	w, resp := doJSON(t, r, "GET", "/api/payments/tiers", "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	tiers := resp["data"].([]interface{})
	require.NotEmpty(t, tiers)
	first := tiers[0].(map[string]interface{})
	assert.Contains(t, first, "amount")
	assert.Contains(t, first, "bonus")
}

// IT-API-PAY-002: a tier recharge credits amount + bonus and records both ledger rows.
func TestPayment_RechargeTierGrantsBonus(t *testing.T) {
	r, _, _, captcha := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captcha)

	w, resp := doJSON(t, r, "POST", "/api/payments/recharge", token, map[string]int{"amount": 10000})
	require.Equal(t, http.StatusOK, w.Code)
	data := resp["data"].(map[string]interface{})
	assert.EqualValues(t, 10000, data["recharged"])
	assert.EqualValues(t, 800, data["bonus"])
	assert.EqualValues(t, 10800, data["balance"])

	w, resp = doJSON(t, r, "GET", "/api/auth/me", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.EqualValues(t, 10800, resp["data"].(map[string]interface{})["balance"])

	w, resp = doJSON(t, r, "GET", "/api/payments/transactions", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	types := map[string]float64{}
	for _, row := range resp["data"].([]interface{}) {
		m := row.(map[string]interface{})
		types[m["txn_type"].(string)] += m["amount"].(float64)
	}
	assert.EqualValues(t, 10000, types["recharge"])
	assert.EqualValues(t, 800, types["bonus"])
}

// IT-API-PAY-003: a custom amount gets no bonus.
func TestPayment_RechargeCustomAmountNoBonus(t *testing.T) {
	r, _, _, captcha := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captcha)

	w, resp := doJSON(t, r, "POST", "/api/payments/recharge", token, map[string]int{"amount": 1234})
	require.Equal(t, http.StatusOK, w.Code)
	data := resp["data"].(map[string]interface{})
	assert.EqualValues(t, 0, data["bonus"])
	assert.EqualValues(t, 1234, data["balance"])
}
