from app.modules.inventory.repository.batch import BatchRepository
from app.modules.inventory.repository.brand import BrandRepository
from app.modules.inventory.repository.category import CategoryRepository
from app.modules.inventory.repository.product import ProductRepository
from app.modules.inventory.repository.serial import SerialRepository, WarrantyRepository
from app.modules.inventory.repository.supplier import SupplierRepository
from app.modules.inventory.repository.transfer import TransferRepository
from app.modules.inventory.repository.unit import UnitRepository
from app.modules.inventory.repository.variant import VariantRepository

__all__ = [
    "BatchRepository",
    "BrandRepository",
    "CategoryRepository",
    "ProductRepository",
    "SerialRepository",
    "SupplierRepository",
    "TransferRepository",
    "UnitRepository",
    "VariantRepository",
    "WarrantyRepository",
]
