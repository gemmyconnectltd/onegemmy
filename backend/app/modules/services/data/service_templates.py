# Curated library of starter service templates a tenant can browse and
# import from on the Services > Catalog page — the same pattern as
# inventory's CATEGORY_TEMPLATES, adapted for bookable services (each item
# carries a suggested duration instead of just a name; price is left at 0
# for the tenant to set since pricing varies by market). A group's name
# becomes the ServiceCategory each imported service is filed under. Covers
# the appointment/walk-in business types the Services module targets — not
# an exhaustive industry list like the product catalog's version.

SERVICE_TEMPLATES: list[dict] = [
    {
        "id": "hair-salon", "name": "Hair Salon", "industry": "Services",
        "groups": [
            {"name": "Hair Services", "items": [
                {"name": "Haircut", "duration_minutes": 30},
                {"name": "Hair Wash & Blow Dry", "duration_minutes": 30},
                {"name": "Hair Coloring", "duration_minutes": 90},
                {"name": "Root Touch-Up", "duration_minutes": 60},
                {"name": "Highlights / Balayage", "duration_minutes": 120},
                {"name": "Hair Treatment", "duration_minutes": 45},
                {"name": "Deep Conditioning", "duration_minutes": 30},
                {"name": "Relaxer / Perm", "duration_minutes": 60},
                {"name": "Braiding", "duration_minutes": 120},
                {"name": "Cornrows", "duration_minutes": 90},
                {"name": "Weave / Extensions", "duration_minutes": 150},
                {"name": "Wig Install", "duration_minutes": 90},
                {"name": "Silk Press", "duration_minutes": 60},
                {"name": "Hair Trim", "duration_minutes": 20},
            ]},
            {"name": "Styling", "items": [
                {"name": "Updo / Special Occasion Style", "duration_minutes": 60},
                {"name": "Blowout", "duration_minutes": 40},
                {"name": "Kids Haircut", "duration_minutes": 20},
                {"name": "Bridal Hair Trial", "duration_minutes": 60},
            ]},
        ],
    },
    {
        "id": "barbershop", "name": "Barbershop", "industry": "Services",
        "groups": [
            {"name": "Barber Services", "items": [
                {"name": "Haircut", "duration_minutes": 30},
                {"name": "Beard Trim", "duration_minutes": 15},
                {"name": "Haircut & Beard Combo", "duration_minutes": 40},
                {"name": "Hot Towel Shave", "duration_minutes": 25},
                {"name": "Line Up / Edge Up", "duration_minutes": 15},
                {"name": "Kids Haircut", "duration_minutes": 20},
                {"name": "Hair Design / Pattern", "duration_minutes": 30},
                {"name": "Fade", "duration_minutes": 35},
                {"name": "Hair Coloring (Men's)", "duration_minutes": 45},
                {"name": "Scalp Treatment", "duration_minutes": 20},
            ]},
            {"name": "Grooming", "items": [
                {"name": "Eyebrow Trim", "duration_minutes": 10},
                {"name": "Ear & Nose Waxing", "duration_minutes": 10},
                {"name": "Facial for Men", "duration_minutes": 30},
            ]},
        ],
    },
    {
        "id": "spa", "name": "Spa", "industry": "Services",
        "groups": [
            {"name": "Body Treatments", "items": [
                {"name": "Full Body Massage", "duration_minutes": 60},
                {"name": "Deep Tissue Massage", "duration_minutes": 60},
                {"name": "Hot Stone Massage", "duration_minutes": 75},
                {"name": "Aromatherapy Massage", "duration_minutes": 60},
                {"name": "Body Scrub", "duration_minutes": 45},
                {"name": "Body Wrap", "duration_minutes": 60},
                {"name": "Couples Massage", "duration_minutes": 60},
            ]},
            {"name": "Facial Treatments", "items": [
                {"name": "Classic Facial", "duration_minutes": 45},
                {"name": "Deep Cleansing Facial", "duration_minutes": 60},
                {"name": "Anti-Aging Facial", "duration_minutes": 60},
                {"name": "Hydrating Facial", "duration_minutes": 50},
                {"name": "Microdermabrasion", "duration_minutes": 45},
            ]},
            {"name": "Wellness", "items": [
                {"name": "Sauna Session", "duration_minutes": 30},
                {"name": "Steam Room Session", "duration_minutes": 30},
                {"name": "Jacuzzi Session", "duration_minutes": 30},
                {"name": "Spa Day Package", "duration_minutes": 180},
            ]},
        ],
    },
    {
        "id": "nail-salon", "name": "Nail Salon", "industry": "Services",
        "groups": [
            {"name": "Manicure & Pedicure", "items": [
                {"name": "Classic Manicure", "duration_minutes": 30},
                {"name": "Classic Pedicure", "duration_minutes": 40},
                {"name": "Gel Manicure", "duration_minutes": 45},
                {"name": "Gel Pedicure", "duration_minutes": 55},
                {"name": "Spa Manicure", "duration_minutes": 50},
                {"name": "Spa Pedicure", "duration_minutes": 60},
                {"name": "Nail Polish Change", "duration_minutes": 15},
            ]},
            {"name": "Enhancements", "items": [
                {"name": "Acrylic Full Set", "duration_minutes": 75},
                {"name": "Acrylic Fill", "duration_minutes": 45},
                {"name": "Gel Extensions", "duration_minutes": 75},
                {"name": "Nail Art (per set)", "duration_minutes": 30},
                {"name": "Nail Repair (per nail)", "duration_minutes": 10},
                {"name": "Nail Removal", "duration_minutes": 20},
            ]},
        ],
    },
    {
        "id": "massage-therapy", "name": "Massage Therapy", "industry": "Services",
        "groups": [
            {"name": "Massage Services", "items": [
                {"name": "Swedish Massage (60 min)", "duration_minutes": 60},
                {"name": "Swedish Massage (90 min)", "duration_minutes": 90},
                {"name": "Deep Tissue Massage (60 min)", "duration_minutes": 60},
                {"name": "Sports Massage", "duration_minutes": 60},
                {"name": "Prenatal Massage", "duration_minutes": 60},
                {"name": "Reflexology", "duration_minutes": 45},
                {"name": "Chair Massage (30 min)", "duration_minutes": 30},
                {"name": "Hot Stone Massage", "duration_minutes": 75},
                {"name": "Trigger Point Therapy", "duration_minutes": 45},
                {"name": "Lymphatic Drainage Massage", "duration_minutes": 60},
            ]},
        ],
    },
    {
        "id": "beauty-center", "name": "Beauty Center", "industry": "Services",
        "groups": [
            {"name": "Hair & Makeup", "items": [
                {"name": "Makeup Application", "duration_minutes": 45},
                {"name": "Bridal Makeup", "duration_minutes": 90},
                {"name": "Makeup Trial", "duration_minutes": 60},
                {"name": "Eyebrow Shaping", "duration_minutes": 15},
                {"name": "Eyebrow Tint", "duration_minutes": 15},
                {"name": "Eyelash Extensions (Classic)", "duration_minutes": 90},
                {"name": "Eyelash Extensions (Volume)", "duration_minutes": 120},
                {"name": "Eyelash Tint", "duration_minutes": 20},
                {"name": "Lash Lift", "duration_minutes": 45},
            ]},
            {"name": "Skin & Hair Removal", "items": [
                {"name": "Facial", "duration_minutes": 45},
                {"name": "Full Leg Waxing", "duration_minutes": 40},
                {"name": "Half Leg Waxing", "duration_minutes": 25},
                {"name": "Full Arm Waxing", "duration_minutes": 25},
                {"name": "Underarm Waxing", "duration_minutes": 10},
                {"name": "Bikini Waxing", "duration_minutes": 30},
                {"name": "Brazilian Waxing", "duration_minutes": 40},
                {"name": "Threading", "duration_minutes": 15},
                {"name": "Chemical Peel", "duration_minutes": 30},
            ]},
        ],
    },
    {
        "id": "tattoo-piercing", "name": "Tattoo & Piercing Studio", "industry": "Services",
        "groups": [
            {"name": "Tattoo", "items": [
                {"name": "Small Tattoo (up to 2in)", "duration_minutes": 45},
                {"name": "Medium Tattoo", "duration_minutes": 120},
                {"name": "Large Tattoo (per session)", "duration_minutes": 240},
                {"name": "Tattoo Touch-Up", "duration_minutes": 30},
                {"name": "Tattoo Consultation", "duration_minutes": 20},
                {"name": "Cover-Up Tattoo (per session)", "duration_minutes": 180},
            ]},
            {"name": "Piercing", "items": [
                {"name": "Ear Piercing", "duration_minutes": 15},
                {"name": "Nose Piercing", "duration_minutes": 15},
                {"name": "Cartilage Piercing", "duration_minutes": 20},
                {"name": "Navel Piercing", "duration_minutes": 20},
                {"name": "Piercing Aftercare Check", "duration_minutes": 10},
            ]},
        ],
    },
    {
        "id": "fitness-personal-training", "name": "Fitness / Personal Training", "industry": "Services",
        "groups": [
            {"name": "Personal Training", "items": [
                {"name": "1-on-1 Personal Training Session", "duration_minutes": 60},
                {"name": "Personal Training (30 min)", "duration_minutes": 30},
                {"name": "Fitness Assessment", "duration_minutes": 45},
                {"name": "Group Training Session (per person)", "duration_minutes": 60},
                {"name": "Nutrition Consultation", "duration_minutes": 45},
            ]},
            {"name": "Classes", "items": [
                {"name": "Yoga Class", "duration_minutes": 60},
                {"name": "Pilates Class", "duration_minutes": 50},
                {"name": "HIIT Class", "duration_minutes": 45},
                {"name": "Spin Class", "duration_minutes": 45},
            ]},
        ],
    },
    {
        "id": "pet-grooming", "name": "Pet Grooming", "industry": "Services",
        "groups": [
            {"name": "Grooming", "items": [
                {"name": "Bath & Brush (Small Dog)", "duration_minutes": 45},
                {"name": "Bath & Brush (Large Dog)", "duration_minutes": 75},
                {"name": "Full Groom (Small Dog)", "duration_minutes": 90},
                {"name": "Full Groom (Large Dog)", "duration_minutes": 120},
                {"name": "Cat Grooming", "duration_minutes": 60},
                {"name": "Nail Trim", "duration_minutes": 15},
                {"name": "Ear Cleaning", "duration_minutes": 15},
                {"name": "Teeth Brushing", "duration_minutes": 15},
                {"name": "De-Shedding Treatment", "duration_minutes": 45},
            ]},
        ],
    },
    {
        "id": "auto-detailing", "name": "Auto Detailing", "industry": "Services",
        "groups": [
            {"name": "Wash & Detail", "items": [
                {"name": "Basic Wash", "duration_minutes": 30},
                {"name": "Full Exterior Detail", "duration_minutes": 90},
                {"name": "Full Interior Detail", "duration_minutes": 90},
                {"name": "Full Interior & Exterior Detail", "duration_minutes": 150},
                {"name": "Engine Bay Cleaning", "duration_minutes": 45},
                {"name": "Waxing & Polishing", "duration_minutes": 60},
                {"name": "Headlight Restoration", "duration_minutes": 45},
                {"name": "Upholstery Shampoo", "duration_minutes": 60},
            ]},
        ],
    },
    {
        "id": "photography-studio", "name": "Photography Studio", "industry": "Services",
        "groups": [
            {"name": "Photo Sessions", "items": [
                {"name": "Portrait Session", "duration_minutes": 60},
                {"name": "Family Photo Session", "duration_minutes": 90},
                {"name": "Passport / ID Photos", "duration_minutes": 15},
                {"name": "Event Photography (per hour)", "duration_minutes": 60},
                {"name": "Product Photography Session", "duration_minutes": 90},
                {"name": "Graduation Photo Session", "duration_minutes": 45},
            ]},
            {"name": "Studio Add-Ons", "items": [
                {"name": "Photo Editing (per set)", "duration_minutes": 30},
                {"name": "Studio Rental (per hour)", "duration_minutes": 60},
            ]},
        ],
    },
    {
        "id": "tutoring-lessons", "name": "Tutoring & Lessons", "industry": "Services",
        "groups": [
            {"name": "Academic Tutoring", "items": [
                {"name": "1-on-1 Tutoring Session", "duration_minutes": 60},
                {"name": "Group Tutoring Session", "duration_minutes": 60},
                {"name": "Exam Prep Session", "duration_minutes": 90},
            ]},
            {"name": "Lessons", "items": [
                {"name": "Music Lesson", "duration_minutes": 45},
                {"name": "Driving Lesson", "duration_minutes": 60},
                {"name": "Language Lesson", "duration_minutes": 45},
                {"name": "Swimming Lesson", "duration_minutes": 45},
            ]},
        ],
    },
]
