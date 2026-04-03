package resolver

import "testing"

func TestIsVersionNewer(t *testing.T) {
	tests := []struct {
		name     string
		versionA string
		versionB string
		want     bool
	}{
		{"newer patch", "2.1.81", "2.1.15", true},
		{"older patch", "2.1.15", "2.1.81", false},
		{"same version", "2.1.81", "2.1.81", false},
		{"newer minor", "2.2.0", "2.1.99", true},
		{"newer major", "3.0.0", "2.9.99", true},
		{"empty versionA", "", "2.1.15", false},
		{"empty versionB", "2.1.81", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isVersionNewer(tt.versionA, tt.versionB)
			if got != tt.want {
				t.Errorf("isVersionNewer(%q, %q) = %v, want %v", tt.versionA, tt.versionB, got, tt.want)
			}
		})
	}
}

func TestCompareVersionNames(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want int // >0 if a>b, <0 if a<b, 0 if equal
	}{
		{"basic newer", "2.1.81", "2.1.15", 1},
		{"basic older", "2.1.15", "2.1.81", -1},
		{"equal", "2.1.15", "2.1.15", 0},
		{"different minor", "2.2.0", "2.1.99", 1},
		{"different major", "3.0.0", "2.9.9", 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compareVersionNames(tt.a, tt.b)
			if (tt.want > 0 && got <= 0) || (tt.want < 0 && got >= 0) || (tt.want == 0 && got != 0) {
				t.Errorf("compareVersionNames(%q, %q) = %d, want sign of %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
