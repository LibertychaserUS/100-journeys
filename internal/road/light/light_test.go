package light

import "testing"

// UT-ROAD-002: shrinkage keeps two full lamps below many warm ones; nothing shows before five.
func TestSum_ShrinksAndHidesUntilFive(t *testing.T) {
	r := Defaults()
	two := Sum([]Lamp{{Real: 5, Moved: 5, Fit: 5, Weight: 1}, {Real: 5, Moved: 5, Fit: 5, Weight: 1}}, 3, r)
	var warm []Lamp
	for i := 0; i < 20; i++ {
		warm = append(warm, Lamp{Real: 4, Moved: 5, Fit: 4, Stamp: "stopped", Weight: 1})
	}
	many := Sum(warm, 3, r)
	if two.Lower >= many.Lower || two.Bright >= many.Bright {
		t.Errorf("two full lamps (%.2f/%.2f) should not outshine twenty warm ones (%.2f/%.2f)", two.Bright, two.Lower, many.Bright, many.Lower)
	}
	if p := two.Public(r); p.Glow != nil || p.Count != nil || len(p.TopStamps) != 0 {
		t.Errorf("two lamps must not show anything: %+v", p)
	}
	p := many.Public(r)
	if p.Glow == nil || *p.Count != 20 || p.TopAxis != "moved" || len(p.TopStamps) != 1 || p.TopStamps[0] != "stopped" {
		t.Errorf("public view of twenty lamps: %+v", p)
	}
	unweighted := Sum([]Lamp{{Real: 5, Weight: 0}}, 3, r)
	if unweighted.N != 0 || unweighted.Bright != 3 {
		t.Errorf("a lamp without weight changes nothing: %+v", unweighted)
	}
	if Glow(1) != 0 || Glow(5) != 5 || Glow(3) != 3 {
		t.Errorf("glow steps: %d %d %d", Glow(1), Glow(3), Glow(5))
	}
}
