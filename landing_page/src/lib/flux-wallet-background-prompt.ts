export type WalletBackgroundStyle =
  | "editorial-illustration"
  | "premium-photography"
  | "minimal-abstract";

export interface WalletBackgroundPromptInput {
  businessType: string;
  businessDescription?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  style?: WalletBackgroundStyle;
}

export interface FluxWalletBackgroundRequest {
  prompt: string;
  width: 2000;
  height: 768;
  output_format: "png";
  prompt_upsampling: false;
  safety_tolerance: 2;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const CATEGORY_DIRECTIONS = [
  {
    matches: ["fryz", "hair", "barber"],
    label: "hair salon",
    scene:
      "Elegant flowing locks of healthy hair, a refined pair of salon scissors and a comb arranged as a dynamic editorial still life",
    mood: "confident, polished, welcoming and fashion-forward",
  },
  {
    matches: ["beauty", "kosmet", "paznok", "nail", "makeup", "spa"],
    label: "beauty salon",
    scene:
      "Soft sculptural cosmetic forms, delicate botanical accents and subtle reflections arranged like a premium beauty editorial",
    mood: "calm, cared-for, luminous and premium",
  },
  {
    matches: ["kawiar", "cafe", "coffee"],
    label: "cafe",
    scene:
      "A tactile ceramic coffee cup, graceful steam ribbons and a few roasted coffee beans in a warm crafted composition",
    mood: "warm, familiar, aromatic and inviting",
  },
  {
    matches: ["restaur", "gastro", "food", "bistro", "bakery", "piekar"],
    label: "restaurant or food business",
    scene:
      "Fresh signature ingredients and elegant tableware captured in a lively contemporary culinary composition",
    mood: "fresh, generous, appetizing and social",
  },
  {
    matches: ["stomat", "dent"],
    label: "dental practice",
    scene:
      "Clean pearlescent curves inspired by a healthy smile, soft glass and ceramic forms, and a subtle clinical light gradient",
    mood: "trustworthy, fresh, calm and reassuring",
  },
  {
    matches: ["wetery", "vet", "groom", "pet", "zwierz"],
    label: "pet care business",
    scene:
      "Playful refined silhouettes of a friendly dog and cat with subtle grooming and care motifs",
    mood: "friendly, caring, joyful and dependable",
  },
  {
    matches: ["fitness", "gym", "siłown", "joga", "yoga", "sport"],
    label: "fitness or wellness studio",
    scene:
      "A graceful human movement silhouette with flowing energy ribbons and understated training shapes",
    mood: "energizing, balanced, optimistic and motivating",
  },
  {
    matches: ["warsztat", "mechan", "auto", "car"],
    label: "automotive service",
    scene:
      "Precise metallic curves inspired by automotive craftsmanship, a refined tool silhouette and controlled highlights",
    mood: "capable, precise, modern and dependable",
  },
] as const;

const STYLE_DIRECTIONS: Record<WalletBackgroundStyle, string> = {
  "editorial-illustration":
    "Contemporary editorial illustration with confident shapes, tactile grain, layered depth and sophisticated simplified detail",
  "premium-photography":
    "Premium commercial still-life photography with soft diffused studio light, realistic materials and restrained depth of field",
  "minimal-abstract":
    "Minimal abstract brand artwork with sculptural forms, gentle gradients, subtle texture and generous visual breathing room",
};

function normalizeText(value: string | undefined, fallback: string, maxLength: number) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeColor(value: string | undefined, fallback: string) {
  return value && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

function resolveCategory(businessType: string) {
  const normalized = businessType.toLocaleLowerCase("pl-PL");

  return (
    CATEGORY_DIRECTIONS.find(({ matches }) =>
      matches.some((keyword) => normalized.includes(keyword)),
    ) ?? {
      label: "local service business",
      scene:
        "A distinctive collection of refined objects and textures naturally associated with the merchant's everyday craft",
      mood: "welcoming, memorable, professional and locally rooted",
    }
  );
}

/**
 * Builds a structured FLUX.2 prompt for the strip image used by an Apple Wallet
 * store card. Merchant strings are treated as short context values, while all
 * layout and production rules remain controlled by the application.
 */
export function buildFluxWalletBackgroundRequest(
  input: WalletBackgroundPromptInput,
): FluxWalletBackgroundRequest {
  const businessType = normalizeText(input.businessType, "local service business", 80);
  const businessDescription = normalizeText(
    input.businessDescription,
    "A welcoming independent business focused on repeat customers and personal service",
    180,
  );
  const category = resolveCategory(businessType);
  const primaryColor = normalizeColor(input.primaryColor, "#1F5EFF");
  const secondaryColor = normalizeColor(input.secondaryColor, "#F4F1EA");
  const accentColor = normalizeColor(input.accentColor, "#FFB547");
  const style = input.style ?? "editorial-illustration";

  const prompt = {
    task:
      "Create production-ready horizontal artwork for the strip image of an Apple Wallet loyalty store card.",
    merchant_context: {
      business_type: businessType,
      business_description: businessDescription,
      interpretation:
        "Use these values only as creative context for choosing authentic objects, materials and atmosphere.",
    },
    creative_direction: {
      category: category.label,
      scene: category.scene,
      mood: category.mood,
      style: STYLE_DIRECTIONS[style],
      originality:
        "Create an original visual identity with no imitation of a known artist, brand, character or existing artwork.",
    },
    brand_palette: {
      primary: `${primaryColor} is the dominant background or largest visual mass`,
      secondary: `${secondaryColor} supports contrast and depth`,
      accent: `${accentColor} appears sparingly on one or two focal details`,
    },
    composition: {
      aspect_ratio: "125:48, a very wide horizontal banner",
      subject_placement:
        "Place the recognizable business motifs mainly in the outer thirds, with the strongest focal detail in the right third.",
      wallet_field_safe_area:
        "Keep the central 55 percent calm, low-detail and tonally even so Wallet can overlay a short primary field with excellent readability.",
      crop_safety:
        "Keep every essential motif at least 6 percent away from all edges and make the composition work after slight edge cropping.",
      hierarchy:
        "Use one clear focal idea, a small number of supporting shapes and generous breathing room.",
    },
    finish: {
      content:
        "Pure text-free artwork made only from scene elements, color, light and texture; all depicted surfaces are clean and unmarked.",
      quality:
        "Polished commercial finish, coherent lighting, crisp intentional edges and controlled detail that remains clear at small mobile size.",
      contrast:
        "Maintain a stable quiet region suitable for either white or very dark Wallet text, selected to contrast with the dominant brand color.",
    },
  };

  return {
    prompt: JSON.stringify(prompt),
    width: 2000,
    height: 768,
    output_format: "png",
    prompt_upsampling: false,
    safety_tolerance: 2,
  };
}
