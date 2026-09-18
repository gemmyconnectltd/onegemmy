# Curated library of starter category templates a tenant can browse and
# import from on the Inventory > Categories page, independent of what
# Industry they picked at signup (that's only used to pick a sensible
# default template to open first). Each "group" is a UI-only grouping for
# browsing — imported categories are always flat (see Category model).

CATEGORY_TEMPLATES: list[dict] = [
    {
        "id": "auto-parts", "name": "Auto Parts and Accessories", "industry": "Retail",
        "groups": [
            {"name": "Engine & Drivetrain", "items": ["Engine Parts", "Belts & Hoses", "Filters", "Transmission Parts"]},
            {"name": "Electrical", "items": ["Batteries", "Wiring & Fuses", "Bulbs & Lighting"]},
            {"name": "Body & Exterior", "items": ["Body Panels", "Mirrors & Glass", "Bumpers"]},
            {"name": "Interior & Accessories", "items": ["Seat Covers", "Floor Mats", "Air Fresheners"]},
            {"name": "Tyres & Wheels", "items": ["Tyres", "Rims", "Wheel Caps"]},
            {"name": "Tools & Fluids", "items": ["Motor Oil", "Coolant", "Hand Tools"]},
        ],
    },
    {
        "id": "bags-luggage", "name": "Bags, Luggage and Accessories", "industry": "Retail",
        "groups": [
            {"name": "Travel Bags", "items": ["Suitcases", "Duffel Bags", "Backpacks"]},
            {"name": "Handbags", "items": ["Totes", "Clutches", "Crossbody Bags"]},
            {"name": "Accessories", "items": ["Wallets", "Belts", "Purses"]},
            {"name": "Kids Bags", "items": ["School Bags", "Lunch Bags"]},
        ],
    },
    {
        "id": "bicycle-motorcycle", "name": "Bicycle and Motorcycle Shop", "industry": "Retail",
        "groups": [
            {"name": "Bicycles", "items": ["Mountain Bikes", "Road Bikes", "Kids Bikes"]},
            {"name": "Motorcycles", "items": ["Scooters", "Motorbikes"]},
            {"name": "Parts", "items": ["Tyres & Tubes", "Chains & Sprockets", "Brakes"]},
            {"name": "Accessories", "items": ["Helmets", "Lights", "Locks"]},
            {"name": "Service", "items": ["Repair Tools", "Lubricants"]},
        ],
    },
    {
        "id": "bookshop-stationery", "name": "Bookshop and Stationery", "industry": "Retail",
        "groups": [
            {"name": "Books", "items": ["Fiction", "Non-Fiction", "Textbooks", "Children's Books"]},
            {"name": "Stationery", "items": ["Pens & Pencils", "Notebooks", "Files & Folders"]},
            {"name": "Office Supplies", "items": ["Printer Paper", "Staplers", "Calculators"]},
            {"name": "Art Supplies", "items": ["Paints", "Brushes", "Sketchbooks"]},
        ],
    },
    {
        "id": "butchery", "name": "Butchery", "industry": "Retail",
        "groups": [
            {"name": "Fresh Meat", "items": ["Beef", "Pork", "Goat", "Lamb"]},
            {"name": "Poultry", "items": ["Chicken", "Turkey", "Eggs"]},
            {"name": "Processed", "items": ["Sausages", "Bacon", "Cold Cuts"]},
            {"name": "Supplies", "items": ["Packaging", "Knives & Tools"]},
        ],
    },
    {
        "id": "cctv-security", "name": "CCTV and Security Equipment", "industry": "Retail",
        "groups": [
            {"name": "Cameras", "items": ["Dome Cameras", "Bullet Cameras", "IP Cameras"]},
            {"name": "Access Control", "items": ["Door Locks", "Biometric Scanners", "Intercoms"]},
            {"name": "Alarms", "items": ["Motion Sensors", "Alarm Panels", "Sirens"]},
            {"name": "Accessories", "items": ["Cables & Connectors", "DVRs & NVRs", "Power Supplies"]},
        ],
    },
    {
        "id": "cereals-dry-goods", "name": "Cereals and Dry Goods", "industry": "Retail",
        "groups": [
            {"name": "Grains", "items": ["Rice", "Maize", "Wheat", "Sorghum"]},
            {"name": "Legumes", "items": ["Beans", "Lentils", "Peas"]},
            {"name": "Flour & Meal", "items": ["Wheat Flour", "Maize Meal", "Cassava Flour"]},
            {"name": "Packaging", "items": ["Sacks", "Sealing Supplies"]},
        ],
    },
    {
        "id": "clothing-apparel", "name": "Clothing and Apparel", "industry": "Retail",
        "groups": [
            {"name": "Men's Wear", "items": ["Shirts", "Trousers", "Suits"]},
            {"name": "Women's Wear", "items": ["Dresses", "Blouses", "Skirts"]},
            {"name": "Kids Wear", "items": ["Boys Clothing", "Girls Clothing", "Infant Wear"]},
            {"name": "Accessories", "items": ["Belts", "Scarves", "Hats"]},
        ],
    },
    {
        "id": "confectionery-snacks", "name": "Confectionery and Snacks", "industry": "Retail",
        "groups": [
            {"name": "Sweets", "items": ["Candy", "Chocolates", "Gum"]},
            {"name": "Snacks", "items": ["Chips", "Biscuits", "Popcorn"]},
            {"name": "Beverages", "items": ["Soft Drinks", "Juices", "Water"]},
            {"name": "Bakery", "items": ["Bread", "Cakes", "Pastries"]},
        ],
    },
    {
        "id": "cosmetics-beauty", "name": "Cosmetics and Beauty Supply", "industry": "Retail",
        "groups": [
            {"name": "Skincare", "items": ["Cleansers & Face Wash", "Moisturisers", "Serums & Treatments", "Sunscreen", "Face Masks", "Toners"]},
            {"name": "Makeup", "items": ["Foundation & Concealer", "Powder & Blush", "Eyeshadow & Liner", "Mascara", "Lipstick & Gloss", "Makeup Brushes & Tools"]},
            {"name": "Haircare", "items": ["Shampoo & Conditioner", "Hair Treatments & Oils", "Styling Products", "Hair Colour & Dye", "Relaxers & Texturisers"]},
            {"name": "Body Care", "items": ["Body Lotion & Cream", "Body Wash & Soap", "Deodorants", "Hand & Foot Care", "Scrubs & Exfoliants"]},
            {"name": "Fragrance", "items": ["Perfume", "Body Spray & Mist", "Roll-Ons"]},
            {"name": "Nail Care", "items": ["Nail Polish", "Nail Treatments", "Manicure & Pedicure Tools", "Artificial Nails"]},
        ],
    },
    {
        "id": "electronics-computers", "name": "Electronics and Computers", "industry": "Technology",
        "groups": [
            {"name": "Computers", "items": ["Laptops", "Desktops", "Monitors"]},
            {"name": "Mobile Devices", "items": ["Smartphones", "Tablets", "Mobile Accessories"]},
            {"name": "Networking", "items": ["Routers", "Switches", "Network Cables"]},
            {"name": "Home Electronics", "items": ["TVs", "Audio Systems", "Small Appliances"]},
        ],
    },
    {
        "id": "fishmonger-seafood", "name": "Fishmonger and Seafood", "industry": "Retail",
        "groups": [
            {"name": "Fresh Fish", "items": ["Tilapia", "Catfish", "Nile Perch"]},
            {"name": "Seafood", "items": ["Shrimp", "Crab", "Octopus"]},
            {"name": "Processed", "items": ["Smoked Fish", "Dried Fish", "Fish Fillets"]},
            {"name": "Supplies", "items": ["Ice", "Packaging"]},
        ],
    },
    {
        "id": "furniture-store", "name": "Furniture Store", "industry": "Retail",
        "groups": [
            {"name": "Living Room", "items": ["Sofas", "Coffee Tables", "TV Stands"]},
            {"name": "Bedroom", "items": ["Beds", "Wardrobes", "Dressers"]},
            {"name": "Office", "items": ["Desks", "Office Chairs", "Filing Cabinets"]},
            {"name": "Outdoor", "items": ["Patio Sets", "Garden Chairs"]},
        ],
    },
    {
        "id": "hardware-store", "name": "Hardware Store", "industry": "Construction",
        "groups": [
            {"name": "Building Materials", "items": ["Cement", "Sand & Gravel", "Timber"]},
            {"name": "Tools", "items": ["Hand Tools", "Power Tools", "Measuring Tools"]},
            {"name": "Electrical", "items": ["Wires & Cables", "Switches & Sockets", "Bulbs"]},
            {"name": "Plumbing", "items": ["Pipes & Fittings", "Taps & Valves", "Water Tanks"]},
            {"name": "Paint", "items": ["Interior Paint", "Exterior Paint", "Brushes & Rollers"]},
        ],
    },
    {
        "id": "pharmacy", "name": "Pharmacy", "industry": "Healthcare",
        "groups": [
            {"name": "Medicines", "items": ["Prescription Drugs", "Over-the-Counter", "Supplements"]},
            {"name": "Personal Care", "items": ["Vitamins", "First Aid", "Baby Care"]},
            {"name": "Medical Equipment", "items": ["Thermometers", "Blood Pressure Monitors", "Glucometers"]},
            {"name": "Hygiene", "items": ["Sanitizers", "Masks", "Gloves"]},
        ],
    },
    {
        "id": "restaurant-cafe", "name": "Restaurant and Café", "industry": "Hospitality",
        "groups": [
            {"name": "Food & Beverages", "items": ["Main Dishes", "Beverages", "Desserts"]},
            {"name": "Kitchen Supplies", "items": ["Cookware", "Utensils", "Cutlery"]},
            {"name": "Bar Supplies", "items": ["Wines", "Spirits", "Mixers"]},
            {"name": "Cleaning & Hygiene", "items": ["Cleaning Supplies", "Disposables"]},
        ],
    },
    {
        "id": "farm-supply", "name": "Farm Supply Store", "industry": "Agriculture",
        "groups": [
            {"name": "Seeds & Seedlings", "items": ["Vegetable Seeds", "Grain Seeds", "Seedlings"]},
            {"name": "Fertilizers & Chemicals", "items": ["Fertilizers", "Pesticides", "Herbicides"]},
            {"name": "Equipment", "items": ["Farm Tools", "Irrigation Equipment", "Machinery"]},
            {"name": "Animal Feed", "items": ["Poultry Feed", "Cattle Feed", "Feed Supplements"]},
        ],
    },
    {
        "id": "school-supplies", "name": "School Supplies Store", "industry": "Education",
        "groups": [
            {"name": "Stationery", "items": ["Notebooks", "Pens & Pencils", "Rulers"]},
            {"name": "Uniforms", "items": ["Boys Uniforms", "Girls Uniforms", "PE Kits"]},
            {"name": "Books", "items": ["Textbooks", "Revision Guides", "Storybooks"]},
            {"name": "Lab Equipment", "items": ["Science Kits", "Lab Coats", "Calculators"]},
        ],
    },
    {
        "id": "supermarket", "name": "General Store / Supermarket", "industry": "Retail",
        "groups": [
            {"name": "Groceries", "items": ["Rice & Grains", "Cooking Oil", "Sugar & Salt"]},
            {"name": "Household", "items": ["Cleaning Supplies", "Toiletries", "Kitchenware"]},
            {"name": "Beverages", "items": ["Soft Drinks", "Water", "Juices"]},
            {"name": "Frozen Foods", "items": ["Frozen Meat", "Frozen Vegetables", "Ice Cream"]},
        ],
    },
    {
        "id": "wholesale-distribution", "name": "Wholesale Distribution", "industry": "Wholesale",
        "groups": [
            {"name": "Bulk Groceries", "items": ["Bulk Rice", "Bulk Sugar", "Bulk Cooking Oil"]},
            {"name": "Packaging Materials", "items": ["Cartons", "Sacks", "Sealing Tape"]},
            {"name": "Industrial Supplies", "items": ["Raw Materials", "Machinery Parts"]},
            {"name": "Building Materials", "items": ["Cement", "Steel Bars", "Timber"]},
        ],
    },
    {
        "id": "salon-spa", "name": "Salon and Spa", "industry": "Services",
        "groups": [
            {"name": "Hair Services", "items": ["Haircare Products", "Styling Tools", "Hair Extensions"]},
            {"name": "Beauty Services", "items": ["Facial Products", "Nail Supplies", "Waxing Supplies"]},
            {"name": "Equipment", "items": ["Salon Chairs", "Mirrors", "Dryers"]},
            {"name": "Retail Products", "items": ["Shampoos", "Skincare", "Cosmetics"]},
        ],
    },
    {
        "id": "manufacturing-supplies", "name": "Manufacturing Supplies", "industry": "Manufacturing",
        "groups": [
            {"name": "Raw Materials", "items": ["Metals", "Plastics", "Chemicals"]},
            {"name": "Work-in-Progress", "items": ["Semi-Finished Goods", "Components"]},
            {"name": "Finished Goods", "items": ["Packaged Products", "Assembled Units"]},
            {"name": "Spare Parts", "items": ["Machine Parts", "Tools", "Consumables"]},
        ],
    },
    {
        "id": "general-merchandise", "name": "General Merchandise Shop", "industry": "Other",
        "groups": [
            {"name": "Household Items", "items": ["Kitchenware", "Cleaning Supplies", "Storage"]},
            {"name": "Personal Items", "items": ["Toiletries", "Accessories"]},
            {"name": "Miscellaneous", "items": ["Gift Items", "Seasonal Items"]},
        ],
    },
]
