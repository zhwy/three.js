#define MIN_HEIGHT 2.0
#define MAX_HEIGHT 4.5
#define WIND vec2(0.1, 0.08)

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;
varying vec3 vBetaR;
varying vec3 vBetaM;
varying float vSunE;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_noise;
uniform float mieDirectionalG;
uniform vec3 up;

float noise(in vec3 x) {
  vec3 f = fract(x);
  vec3 p = floor(x);
  f = f * f * (3.0 - 2.0 * f);

  p.xz += WIND * u_time;
  vec2 uv = (p.xz + vec2(37.0, 17.0) * p.y) + f.xz;
  vec2 rg = texture(u_noise, (uv + 0.5) / 256.0, 0.0).yx;
  return mix(rg.x, rg.y, f.y);
}

float fractal_noise(vec3 p) {
  float f = 0.0;
	// add animation
	// p = p - vec3(1.0, 1.0, 0.0) * u_time * 0.1;
  p = p * 3.0;
  f += 0.50000 * noise(p);
  p = 2.0 * p;
  f += 0.25000 * noise(p);
  p = 2.0 * p;
  f += 0.12500 * noise(p);
  p = 2.0 * p;
  f += 0.06250 * noise(p);
  p = 2.0 * p;
  f += 0.03125 * noise(p);

  return f;
}

float density(vec3 pos) {
  float den = 3.0 * fractal_noise(pos * 0.3) - 2.0 + (pos.y - MIN_HEIGHT);
  float edge = 1.0 - smoothstep(MIN_HEIGHT, MAX_HEIGHT, pos.y);
  edge *= edge;
  den *= edge;
  den = clamp(den, 0.0, 1.0);

  return den;
}

vec3 raymarching(vec3 ro, vec3 rd, float t, vec3 backCol) {
  vec4 sum = vec4(0.0);
  vec3 pos = ro + rd * t;
  for(int i = 0; i < 20; i++) {
    if(sum.a > 0.99 ||
      pos.y < (MIN_HEIGHT - 1.0) ||
      pos.y > (MAX_HEIGHT + 1.0))
      break;

    float den = density(pos);

		//  clouds color
    if(den > 0.01) {
      float dif = clamp((den - density(pos + 0.3 * vSunDirection)) / 0.6, 0.0, 1.0);

      vec3 lin = vec3(0.65, 0.7, 0.75) * 1.5 + vec3(0.8, 0.8, 0.8) * dif;
      vec4 col = vec4(mix(vec3(1.0, 0.95, 0.8) * 1.1, vec3(0.35, 0.4, 0.45), den), den);
      col.rgb *= lin;

			// front to back blending
      col.a *= 0.5;
      col.rgb *= col.a;

      sum = sum + col * (1.0 - sum.a);
    }

    t += max(0.05, 0.02 * t);
    pos = ro + rd * t;
  }

  sum = clamp(sum, 0.0, 1.0);

  float h = rd.y;
  sum.rgb = mix(sum.rgb, backCol, exp(-20. * h * h));

  return mix(backCol, sum.xyz, sum.a);
}

float planeIntersect(vec3 ro, vec3 rd, float plane) {
  float h = plane - ro.y;
  return h / rd.y;
}

mat3 setCamera(vec3 ro, vec3 ta, float cr) {
  vec3 cw = normalize(ta - ro);
  vec3 cp = vec3(sin(cr), cos(cr), 0.0);
  vec3 cu = normalize(cross(cw, cp));
  vec3 cv = normalize(cross(cu, cw));
  return mat3(cu, cv, cw);
}

const vec3 cameraPos = vec3(0.0, 0.0, 0.0);

// constants for atmospheric scattering
const float pi = 3.141592653589793238462643383279502884197169;

const float n = 1.0003; // refractive index of air
const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

// optical length at zenith for molecules
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
// 66 arc seconds -> degrees, and the cosine of that
const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

// 3.0 / ( 16.0 * pi )
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
// 1.0 / ( 4.0 * pi )
const float ONE_OVER_FOURPI = 0.07957747154594767;

float rayleighPhase(float cosTheta) {
  return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0));
}

float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
  return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (2.0 * fragCoord.xy - u_resolution.xy) / u_resolution.yy;
	// vec2 mo = vec2(0.0);

  vec3 ro = vec3(0.0, 0.0, -2.0);

	// // Rotate the camera
	// vec3 target = vec3(ro.x + 10., 1.0 + mo.y * 3.0, ro.z);

	// vec2 cossin = vec2(cos(mo.x), sin(mo.x));
	// mat3 rot = mat3(cossin.x, 0.0, -cossin.y, 0.0, 1.0, 0.0, cossin.y, 0.0, cossin.x);
	// target = rot * (target - ro) + ro;

  vec3 target = vWorldPosition;
	// Compute the ray
  vec3 rd = setCamera(ro, target, 0.0) * normalize(vec3(p.xy, 1.5));

  float dist = planeIntersect(ro, rd, MIN_HEIGHT);

  float sun = clamp(dot(vSunDirection, rd), 0.0, 1.0);
	// ground color and sky color
  // vec3 col = mix(vec3(0.5, 0.5, 0.5), vec3(0.03, 0.1, 0.94), p.y * 0.5 + 0.5);
	// vec3 col = mix(vec3(0.5, 0.5, 0.5), vec3(0.,0.,1.), p.y * 0.5 + 0.5);
  vec3 col = vec3(0.03, 0.1, 0.94);
  // vec3 col = vec3(0, 0, 1);
	// sun color
	// col += 0.5 * vec3(1.0, 1., 0.8) * pow(sun, 8.0);

  if(dist > 0.) {
    col = raymarching(ro, rd, dist, col);
  }

  vec3 direction = normalize(vWorldPosition - cameraPos);

	// optical length
	// cutoff angle at 90 to avoid singularity in next formula.
  float zenithAngle = acos(max(0.0, dot(up, direction)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;

	// combined extinction factor
  vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));

	// in scattering
  float cosTheta = dot(direction, vSunDirection);

  float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaRTheta = vBetaR * rPhase;

  float mPhase = hgPhase(cosTheta, mieDirectionalG);
  vec3 betaMTheta = vBetaM * mPhase;

  vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));

	// nightsky
  float theta = acos(direction.y); // elevation --> y-axis, [-pi/2, pi/2]
  float phi = atan(direction.z, direction.x); // azimuth --> x-axis [-pi/2, pi/2]
  vec2 uv = vec2(phi, theta) / vec2(2.0 * pi, pi) + vec2(0.5, 0.0);
  vec3 L0 = vec3(0.1) * Fex;

	// composition + solar disc
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  L0 += (vSunE * 19000.0 * Fex) * sundisk;

	// vec3 texColor = ( Lin + L0 ) * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
  vec3 texColor = (Lin + L0) * 0.04 + col;

  // vec3 retColor = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));
  vec3 retColor = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));

  fragColor = vec4(retColor, 1.0);
  // fragColor = vec4(texColor, 1.);
  // fragColor = vec4( col, 1.0 );

}

void main() {
  mainImage(pc_fragColor, gl_FragCoord.xy);

  #include <tonemapping_fragment>
	#include <colorspace_fragment>
}
