from rest_framework.routers import SimpleRouter

from .views import CategoryViewSet, ProductViewSet, TaxRuleViewSet

router = SimpleRouter()
router.register("products", ProductViewSet, basename="product")
router.register("categories", CategoryViewSet, basename="category")
router.register("tax-rules", TaxRuleViewSet, basename="tax-rule")

urlpatterns = router.urls
