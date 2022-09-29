import $ from 'jquery';
import utils from '@bigcommerce/stencil-utils';
import 'foundation-sites/js/foundation/foundation';
import 'foundation-sites/js/foundation/foundation.reveal';
import ImageGallery from '../product/image-gallery';
import modalFactory from '../global/modal';
import _ from 'lodash';
import swal from 'sweetalert2';

export default class ProductDetails {
    constructor($scope, context, productAttributesData = {}) {
        this.$overlay = $('[data-cart-item-add] .loadingOverlay');
        this.$scope = $scope;
        this.context = context;
        this.imageGallery = new ImageGallery($('[data-image-gallery]', this.$scope));
        this.imageGallery.init();
        this.listenQuantityChange();
        this.initRadioAttributes();
        this.$hasSoldOut = false;
        this.$pSKUList = [];
        this.$poSKUList = [];
        this.$pCurrent = null;
        this.$allureException = ['coco', 'rose', 'adele', 'angelina', 'jessica', 'selena', 'taylor', 'julia', 'nicole', 'gwyneth', 'ev7914', 'tl6814', 'ev5714', 'mo5514', 'mo7608', 'ev5512', 'ev5706', 'ev6810', 'eg6612', 'eh16', 'mh2206', 'sh5206', 'ep3608', 'mh2216', 'maya', 'noya'];
        this.$cart = null;
        this.$productAttributesData = productAttributesData;

        const $form = $('form[data-cart-item-add]', $scope);
        const $productOptionsElement = $('[data-product-option-change]', $form);
        const hasOptions = $productOptionsElement.html()?$productOptionsElement.html().trim().length:0;

        $productOptionsElement.change(event => {
            this.productOptionsChanged(event);
        });

        $form.submit(event => {
            this.addProductToCart(event, $form[0]);
        });

        // Update product attributes. If we're in quick view and the product has options,
        // then also update the initial view in case items are oos
        if (_.isEmpty(productAttributesData) && hasOptions) {
            const $productId = $('[name="product_id"]', $form).val();
            this.getCart(productAttributesData);

            utils.api.productAttributes.optionChange($productId, $form.serialize(), (err, response) => {
                const attributesData = response.data || {};

                this.updateProductAttributes(attributesData);
                this.updateView(attributesData);
                this.$productAttributesData = attributesData;
            });
        } else {
            // this.updateProductAttributes(productAttributesData);
            this.initProductAttributes(productAttributesData);
            if (hasOptions) {
                this.getCart(productAttributesData);
            } else {
                this.getCart(productAttributesData, false);
            }
            if (this.$hasSoldOut) {
                // $(".btn-book").show();
                $(".btn-book-more").show();
            }
        }

        $productOptionsElement.show();

        this.previewModal = modalFactory('#previewModal')[0];
        this.previewModal1 = modalFactory('#previewModal1')[0];
        this.previewModal2 = modalFactory('.modal-dropdown')[0]
    }

    /**
     * @summary Get the current cart data and then start getting Earlist ship out list
     * 
     * @param {json} attributesData Init option data
     * @param {boolean} hasOptions True if this product has options, or else false
     */
     getCart(attributesData, hasOptions=true) {
        utils.api.cart.getCart({}, (err,response)=>{
            if (err) {
                if (hasOptions) {
                    this.getTeamdeskInventoryList(attributesData);
                } else {
                    this.getTeamdeskInventoryBySKU(attributesData);
                }
                return;
            }
            this.$cart = response;
            if (hasOptions) {
                this.getTeamdeskInventoryList(attributesData);
            } else {
                this.getTeamdeskInventoryBySKU(attributesData);
            }
        })
    }

    /**
     * Since $productView can be dynamically inserted using render_with,
     * We have to retrieve the respective elements
     *
     * @param $scope
     */
    getViewModel($scope) {
        return {
            $priceWithTax: $('[data-product-price-with-tax]', $scope),
            $rrpWithTax: $('[data-product-rrp-with-tax]', $scope),
            $priceWithoutTax: $('[data-product-price-without-tax]', $scope),
            $rrpWithoutTax: $('[data-product-rrp-without-tax]', $scope),
            $weight: $('.productView-info [data-product-weight]', $scope),
            $increments: $('.form-field--increments :input', $scope),
            $addToCart: $('#form-action-addToCart', $scope),
            $wishlistVariation: $('[data-wishlist-add] [name="variation_id"]', $scope),
            stock: {
                $container: $('.form-field--stock', $scope),
                $input: $('[data-product-stock]', $scope),
            },
            $sku: $('[data-product-sku]'),
            $upc: $('[data-product-upc]'),
            quantity: {
                $text: $('.incrementTotal', $scope),
                $input: $('[name=qty\\[\\]]', $scope),
            },
        };
    }

    /**
     * Checks if the current window is being run inside an iframe
     * @returns {boolean}
     */
    isRunningInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    /**
     *
     * Handle product options changes
     *
     */
    productOptionsChanged(event) {
        const $changedOption = $(event.target);
        const $form = $changedOption.parents('form');
        const productId = $('[name="product_id"]', $form).val();

        // Do not trigger an ajax request if it's a file or if the browser doesn't support FormData
        if ($changedOption.attr('type') === 'file' || window.FormData === undefined) {
            return;
        }

        utils.api.productAttributes.optionChange(productId, $form.serialize(), (err, response) => {
            const productAttributesData = response.data || {};

            this.$productAttributesData = productAttributesData;

            this.updateProductAttributes(productAttributesData);
            this.updateView(productAttributesData);
            this.updateDeliverTime(productAttributesData);
        });
    }

    showProductImage(image) {
        if (_.isPlainObject(image)) {
            const zoomImageUrl = utils.tools.image.getSrc(
                image.data,
                this.context.themeSettings.zoom_size,
            );

            const mainImageUrl = utils.tools.image.getSrc(
                image.data,
                this.context.themeSettings.product_size,
            );

            this.imageGallery.setAlternateImage({
                mainImageUrl,
                zoomImageUrl,
            });
        } else {
            this.imageGallery.restoreImage();
        }
    }

    /**
     *
     * Handle action when the shopper clicks on + / - for quantity
     *
     */
    listenQuantityChange() {
        let isInput = false;
        this.$scope.on('keydown', '[data-quantity-change] input', (event) => {
            if (event.keyCode === 13) {
                isInput = true;
            }
        })
        this.$scope.on('click', '[data-quantity-change] button', (event) => {
            event.preventDefault();
            const $target = $(event.currentTarget);
            const viewModel = this.getViewModel(this.$scope);
            const $input = viewModel.quantity.$input;
            const quantityMin = parseInt($input.data('quantity-min'), 10);
            const quantityMax = parseInt($input.data('quantity-max'), 10);

            let qty = parseInt($input.val(), 10);

            // If action is incrementing
            if ($target.data('action') === 'inc') {
                // If quantity max option is set
                if (quantityMax > 0) {
                    // Check quantity does not exceed max
                    if ((qty + 1) <= quantityMax) {
                        qty++;
                    }
                } else {
                    qty++;
                }
            } else if (isInput) {
                isInput = false;
                if (qty<quantityMin && quantityMin>0) {
                    qty = quantityMin;
                } else if (qty>quantityMax && quantityMax>0) {
                    qty = quantityMax;
                } else if (qty<=0) {
                    qty = 1;
                }
            } else if (qty > 1) {
                // If quantity min option is set
                if (quantityMin > 0) {
                    // Check quantity does not fall below min
                    if ((qty - 1) >= quantityMin) {
                        qty--;
                    }
                } else {
                    qty--;
                }
            }

            // update hidden input
            viewModel.quantity.$input.val(qty);
            // update text
            viewModel.quantity.$text.text(qty);

            if (this.$pCurrent) {
                this.updateDeliverTime(this.$pCurrent);
            }

        });
    }

    /**
     *
     * Add a product to cart
     *
     */
    addProductToCart(event, form) {
        const $addToCartBtn = $('#form-action-addToCart', $(event.target));
        const originalBtnVal = $addToCartBtn.val();
        const waitMessage = $addToCartBtn.data('waitMessage');

        // Do not do AJAX if browser doesn't support FormData
        if (window.FormData === undefined) {
            return;
        }

        // Prevent default
        event.preventDefault();

        $addToCartBtn
            .val(waitMessage)
            .prop('disabled', true);

        this.$overlay.show();

        // Add item to cart
        utils.api.cart.itemAdd(new FormData(form), (err, response) => {
            const errorMessage = err || response.data.error;

            $addToCartBtn
                .val(originalBtnVal)
                .prop('disabled', false);

            this.$overlay.hide();

            // Guard statement
            if (errorMessage) {
                // Strip the HTML from the error message
                const tmp = document.createElement('DIV');
                tmp.innerHTML = errorMessage;

                return swal({
                    text: tmp.textContent || tmp.innerText,
                    type: 'error',
                });
            }

            // Open preview modal and update content
            if (this.previewModal) {
                this.previewModal.open();

                this.updateCartContent(this.previewModal, response.data.cart_item.hash);
                $('.modal-dropdown').css({'display':'none'});
            } else if (this.previewModal1) {
                this.previewModal1.open();
                $('.modal-dropdown').css({'display':'none'});

                this.updateCartContent(this.previewModal1, response.data.cart_item.hash);

            } else {
                this.$overlay.show();
                // if no modal, redirect to the cart page
                this.redirectTo(response.data.cart_item.cart_url || this.context.urls.cart);
            }
        });
    }

    /**
     * Get cart contents
     *
     * @param {String} cartItemHash
     * @param {Function} onComplete
     */
    getCartContent(cartItemHash, onComplete) {
        const options = {
            template: 'cart/preview',
            params: {
                suggest: cartItemHash,
            },
            config: {
                cart: {
                    suggestions: {
                        limit: 4,
                    },
                },
            },
        };

        utils.api.cart.getContent(options, onComplete);
    }

    /**
     * Redirect to url
     *
     * @param {String} url
     */
    redirectTo(url) {
        if (this.isRunningInIframe() && !window.iframeSdk) {
            window.top.location = url;
        } else {
            window.location = url;
        }
    }

    /**
     * Update cart content
     *
     * @param {Modal} modal
     * @param {String} cartItemHash
     * @param {Function} onComplete
     */
    updateCartContent(modal, cartItemHash, onComplete) {
        this.getCartContent(cartItemHash, (err, response) => {
            if (err) {
                return;
            }

            modal.updateContent(response);

            // Update cart counter
            const $body = $('body');
            const $cartQuantity = $('[data-cart-quantity]', modal.$content);
            const $cartCounter = $('.navUser-action .cart-count');
            const quantity = $cartQuantity.data('cart-quantity') || 0;

            $cartCounter.addClass('cart-count--positive');
            $body.trigger('cart-quantity-update', quantity);

            if (onComplete) {
                onComplete(response);
            }
        });

        utils.api.cart.getCart({}, (err,response)=>{
            if (err) {                
                return;
            }
            this.$cart = response;

            $(".del-btn-wrap").remove();
            $(".del-select-wrap").remove();
            $(".del-content-wrap").remove();
            $(".del-content-see-more").remove();
            this.setEarliestTime();

            this.updateDeliverTime(this.$productAttributesData);
        })

    }

    /**
     * Show an message box if a message is passed
     * Hide the box if the message is empty
     * @param  {String} message
     */
    showMessageBox(message) {
        const $messageBox = $('.productAttributes-message');

        if (message) {
            $('.alertBox-message', $messageBox).text(message);
            $messageBox.show();
        } else {
            $messageBox.hide();
        }
    }

    /**
     * Update the view of price, messages, SKU and stock options when a product option changes
     * @param  {Object} data Product attribute data
     */
    updatePriceView(viewModel, price) {
        if (price.with_tax) {
            viewModel.$priceWithTax.html(price.with_tax.formatted);
        }

        if (price.without_tax) {
            viewModel.$priceWithoutTax.html(price.without_tax.formatted);
        }

        if (price.rrp_with_tax) {
            viewModel.$rrpWithTax.html(price.rrp_with_tax.formatted);
        }

        if (price.rrp_without_tax) {
            viewModel.$rrpWithoutTax.html(price.rrp_without_tax.formatted);
        }
    }

    /**
     * Update the view of price, messages, SKU and stock options when a product option changes
     * @param  {Object} data Product attribute data
     */
     updateView(data) {
        const viewModel = this.getViewModel(this.$scope);
        const check1 = window.Foundation.scope.children[0].classList.contains('quickView')
        this.showMessageBox(data.stock_message || data.purchasing_message);

        if (_.isObject(data.price)) {
            this.updatePriceView(viewModel, data.price);
        }

        if (_.isObject(data.weight)) {
            viewModel.$weight.html(data.weight.formatted);
        }

        // Set variation_id if it exists for adding to wishlist
        if (data.variantId) {
            viewModel.$wishlistVariation.val(data.variantId);
        }

        // If SKU is available
        if (data.sku && !check1) {
            viewModel.$sku.text(data.sku);
        }

        // If UPC is available
        if (data.upc) {
            viewModel.$upc.text(data.upc);
        }

        // if stock view is on (CP settings)
        if (viewModel.stock.$container.length && _.isNumber(data.stock)) {
            // if the stock container is hidden, show
            viewModel.stock.$container.removeClass('u-hiddenVisually');

            // viewModel.stock.$input.text(data.stock);
        }

        if (!data.purchasable || !data.instock) {
            viewModel.$addToCart.prop('disabled', true);
            viewModel.$increments.prop('disabled', true);
        } else {
            viewModel.$addToCart.prop('disabled', false);
            viewModel.$increments.prop('disabled', false);
        }
    }
    
    /**
     * @summary Get Incoming Quantity and Time from PO  List
     *      
     * @param {integer} qty How many we would like to check
     * @param {integer} inItems PO List of same SKU 
     * @param {boolean} strict If strict will return null if it could not cover the qty
     * @param {integer} buff Total existent quantity in current cart
     * @returns {json} Returns Quantity Incoming that we will use and index of PO
     */
     getIncomingTime(qty, inItems, strict=true, buff=0) {
        let i = -1;
        let qPO = -2-buff;        
        while (qPO<qty && i<inItems.length-1) {
            i++;
            qPO+=inItems[i]["Incoming Quantity"];            
        }
        if (strict) {
            if (qPO>=qty && i<inItems.length) {
                return {
                    qPO,
                    i
                }
            } else {
                return null;
            }
        } else {
            return {
                qPO,
                i
            }
        }        
    }

    /**
     * @summary Set Earliest time section
     *      
     */
    setEarliestTime() {
        let dlTBody = "";
        let nowBtn = false;
        let transferBtn = false;
        let transitBtn = false;                    
        let virtualBtn = [];
        let virtualSBtn = [];
        function monthDiff(d1, d2) {
            var months;
            months = (d2.getFullYear() - d1.getFullYear()) * 12;
            months -= d1.getMonth();
            months += d2.getMonth();
            return months <= 0 ? 0 : months;
        }
        function isOdd(num) {
            return num%2;
        }
        for (let td of this.$pSKUList) {
            let buff = 0;
            if (this.$cart) {
                if (this.$cart.length>0) {
                    let citem = this.$cart[0].lineItems.physicalItems.filter(c=>c.sku.toLowerCase()==td["SKU"].toLowerCase());
                    if (citem.length>0) {
                        buff = citem.reduce((a,b)=>a+b.quantity,0);
                    }
                }                
            }
            let qtyNote = "";
            if (Number(td["Available Quantity"])-buff>0) {
                if (td["Available Quantity"] != td["Total On Hand"]) {
                    if (transferBtn == false) {
                        transferBtn = true;
                    }
                    qtyNote = Number(td["Available Quantity"])-buff>10?"More than 10":Number(td["Available Quantity"])-buff;
                    dlTBody +=`
                        <div 
                            data-qty-transfer=${Number(td["Available Quantity"])-buff} 
                            data-del-data="Current stock: ${qtyNote}">
                            ${td.SKU.toUpperCase()}
                        </div>
                    `;                    
                } else {                    
                    if (Number(td["2"])-buff>0) {
                        if (nowBtn == false) {
                            nowBtn = true;   
                        }
                        dlTBody +=`
                        <div 
                            data-qty-now=${Number(td["2"]) - buff}
                            data-del-data="Qty US: ${Number(td["2"])-buff>10?"More than 10":Number(td["2"])-buff}&#xa;Qty Canada: ${Number(td["WH1"])>10?"More than 10":Number(td["WH1"])}">
                            ${td.SKU.toUpperCase()}
                        </div>
                    `;
                    } else {
                        let tempbuff = buff -  Number(td["2"])
                        if (transferBtn == false) {
                            transferBtn = true;
                        }
                        qtyNote = Number(td["WH1"])-tempbuff>10?"More than 10":Number(td["WH1"])-tempbuff;
                        dlTBody +=`
                            <div 
                                data-qty-transfer=${Number(td["WH1"])-tempbuff}
                                data-del-data="Qty Canada: ${Number(td["WH1"])-tempbuff>10?"More than 10":Number(td["WH1"])}">
                                ${td.SKU.toUpperCase()}
                            </div>
                        `;          
                    }

                }                
            } else if (td["Virtual Location"]) {                
                buff -= Number(td["Available Quantity"]);                
                if (td["Lock Status"]!="Locked for processing" && (Number(td["Unlocked for sale quantity"])-buff)>0) {
                    if (transitBtn == false) {
                        transitBtn = true;
                    }
                    qtyNote=Number(td["Unlocked for sale quantity"])-buff>10?"More than 10":Number(td["Unlocked for sale quantity"])-buff;
                    dlTBody +=`
                        <div                                 
                            data-qty-transit=${(Number(td["Unlocked for sale quantity"])-buff)>0?Number(td["Unlocked for sale quantity"])-buff:0}                                         
                            data-del-data="Qty in transit: ${qtyNote}">
                            ${td.SKU.toUpperCase()}
                        </div>`;                                        
                } else if (Number(td["Quantity Incoming"])-2-buff>0) {
                    if (td["Lock Status"]!="Locked for processing") {
                        buff -= Number(td["Unlocked for sale quantity"]);
                    }                   
                    let inItems = this.$poSKUList.filter(p=>p.SKU.toUpperCase()==td["SKU"].toUpperCase());
                    let isAllure = this.$allureException.includes(td["Part Number"].toLowerCase()) && td["Classification"].includes("Women");
                    if (inItems.length>0) {
                        let cPO = this.getIncomingTime(1, inItems, true, buff);                                
                        if (cPO) {
                            let inItem = inItems[cPO.i];
                            let today = new Date();
                            let arrival = new Date(inItem["Arrival Due Date"]);
                            let mDiff = monthDiff(new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()), new Date(arrival.getUTCFullYear(), arrival.getUTCMonth(), arrival.getUTCDate()));                           
                            if (mDiff==0) {   
                                if (isAllure) {
                                    mDiff+=3;
                                } else {
                                    mDiff+=1;
                                }                                
                                
                            } else {
                                if (isAllure) {
                                    mDiff+=2;
                                }                                                                
                            }
                            if (isOdd(mDiff) && mDiff<7) {
                                mDiff+=1;
                            }
                            let m = mDiff<7?`${mDiff}-${mDiff+1}M`:`${mDiff}M`;
                            let vIdx = virtualBtn.findIndex(v=>v.name==m);
                            if (vIdx==-1) {
                                virtualBtn.push({
                                    name: m,
                                    section: "production"
                                });
                            } else if (virtualBtn[vIdx].section=="preorder") {
                                virtualBtn[vIdx].section="combination";
                            }
                            qtyNote=cPO.qPO>10?"More than 10":cPO.qPO;
                            dlTBody +=`
                                <div                                 
                                    data-qty-${m}=${cPO.qPO} 
                                    data-del-data="Qty in production: ${qtyNote}">
                                    ${td.SKU.toUpperCase()}
                                </div>
                            `;                            
                        }                                    
                    }                          
                } else if (Number(td["Virtual Quantity"])-buff>0){
                    buff = buff - Number(td["Quantity Incoming"]) - 2;
                    if (td["Virtual Location"].includes("_")) {
                        let vName = td["Virtual Location"].replace("_","-");
                        let vIdx = virtualBtn.findIndex(v=>v.name==vName);                        
                        if (vIdx==-1) {
                            virtualBtn.push({
                                name: vName,
                                section: "preorder"
                            });
                        } else if (virtualBtn[vIdx].section=="production") {
                            virtualBtn[vIdx].section="combination";
                        }
                        qtyNote = Number(td["Virtual Quantity"])-buff>10?"More than 10":Number(td["Virtual Quantity"])-buff;
                        dlTBody +=`
                            <div                                 
                                data-qty-${vName}=${Number(td["Virtual Quantity"])-buff} 
                                data-del-data="Allowed Pre-order: ${qtyNote}">
                                ${td.SKU.toUpperCase()}
                            </div>
                        `;   
                    } else {
                        let m = td["Virtual Location"][0];
                        if (isOdd(Number(m)) && Number(m)<7) {
                            m=Number(m)+1;
                        }                        
                        m = m<7?`${m}-${Number(m)+1}M`:`${m}M`;                        
                        let vIdx = virtualBtn.findIndex(v=>v.name==m);
                        if (vIdx==-1) {
                            virtualBtn.push({
                                name: m,
                                section: "preorder"
                            });
                        } else if (virtualBtn[vIdx].section=="production") {
                            virtualBtn[vIdx].section="combination";
                        }
                        qtyNote = Number(td["Virtual Quantity"])-buff>10?"More than 10":Number(td["Virtual Quantity"])-buff;
                        dlTBody +=`
                            <div                                 
                                data-qty-${m}=${Number(td["Virtual Quantity"])-buff} 
                                data-del-data="Allowed Pre-order: ${qtyNote}">
                                ${td.SKU.toUpperCase()}
                            </div>
                        `;   
                    }                                    
                }                            
            }
        }
        let btnWrap = "";
        let selectWrap = "<select>";
        if (nowBtn) {
            btnWrap+=`<input type="radio" id="del-time-now" value="now" name="delOption" class="del-input" data-desp="These units are in stock and can be shipped out as soon as possible."><label for="del-time-now" class="del-label">1 day</label>`;
            selectWrap+=`<option value="now" data-desp="These units are in stock and can be shipped out as soon as possible.">1 day</option>`;
        }
        if (transferBtn) {
            btnWrap+=`<input type="radio" id="del-time-transfer" value="transfer" name="delOption" class="del-input" data-desp="These units are in stock and can be shipped out as soon as possible."><label for="del-time-transfer" class="del-label">2-4 days</label>`;
            selectWrap+=`<option value="transfer" data-desp="These units are in stock and can be shipped out as soon as possible.">2-4 days</option>`;
        }
        if (transitBtn) {
            btnWrap+=`<input type="radio" id="del-time-transit" value="transit" name="delOption" class="del-input" data-desp="These units are in transit to our warehouses and can be shipped out in a few days."><label for="del-time-transit" class="del-label">5-7 days</label>`;
            selectWrap+=`<option value="transit" data-desp="These units are in transit to our warehouses and can be shipped out in a few days.">5-7 days</option>`;
        }
        if (virtualBtn.length>0) {
            virtualBtn.sort((a,b)=> a.name.replace(/\D+/g,'')>b.name.replace(/\D+/g,'')?1:b.name.replace(/\D+/g,'')>a.name.replace(/\D+/g,'')?-1:0);            
            for (let v of virtualBtn) {
                // let lb = v[0]>1?v.replace("M"," months").replace("_","-"):v.replace("M"," month").replace("_","-");
                let lb = v.name=="1M"?"1 month":v.name.replace("M", " months");
                let desp = v.section=="production"?"These units are still in production. Once they are complete, they will be in transit to our warehouses ready to be shipped out.":(v.section=="preorder"?"These units are not in production and will start once an order is placed.":"These units are either in production or yet to start production. However, they are expected to be ship out in the same timeframe.");
                btnWrap+=`<input type="radio" id="del-time-virtual-${v.name}" value="${v.name.toLowerCase()}" name="delOption" class="del-input" data-desp="${desp}"><label for="del-time-virtual-${v.name}" class="del-label">${lb}</label>`;
                selectWrap+=`<option value="${v.name.toLowerCase()}" data-desp="${desp}">${lb}</option>`;
            }
        }
        // if (virtualSBtn.length>0) {
        //     virtualSBtn.sort((a,b)=> (Number(a.replace(/\D+/g,''))>Number(b.replace(/\D+/g,'')))?1:((Number(b.replace(/\D+/g,''))>Number(a.replace(/\D+/g,'')))?-1:0));
        //     console.log(virtualSBtn);
        //     for (let v of virtualSBtn) {                                
        //         let lb = v.replace("M"," months").replace("_","-");
        //         let desp = "These units are not in production and will start once an order is placed.";
        //         btnWrap+=`<input type="radio" id="del-time-virtual-${v}" value="${v.toLowerCase()}" name="delOption" class="del-input" data-desp="${desp}"><label for="del-time-virtual-${v}" class="del-label">${lb}</label>`;
        //         selectWrap+=`<option value="${v.toLowerCase()}" data-desp="${desp}">${lb}</option>`;
        //     }
        // }
        selectWrap+="</select>";     
        // console.log(btnWrap);
        $(".del-content-wrap").remove();
        $(".delivery-wrap").append(`<div class="del-btn-wrap">${btnWrap}</div><div class="del-select-wrap">${selectWrap}</div><div class="del-content-wrap del-content-hidden">${dlTBody}</div>`).show();
        if ($(document).width()<800) {
            $(".delivery-wrap").insertAfter(".productView-images");
        }
        $("input[type=radio][name=delOption], .del-select-wrap select").on("change", function() {                        
            $("[data-del-data]").hide();
            let val = $(this).val();                                                
            $("[data-del-data]").filter(function(){                                                                                        
                return Number(this.getAttribute(`data-qty-${val}`))>0;
            }).show();
            if ($(".del-content-wrap").hasClass("del-content-hidden")) {
                $(".del-content-see-more").remove();
                $(".data-del-hidden").removeClass("data-del-hidden");
                if ($("[data-del-data]:visible").length>12) {
                    $("[data-del-data]:visible").slice(12).addClass("data-del-hidden");
                    $(".delivery-wrap").append(`<div class="del-content-see-more"><svg viewBox="0 0 290.81 166.95"> <g transform="translate(-97.205 -134.48)"> <circle cx="241.37" cy="169.48" r="35" stroke-linejoin="round" stroke-width="6.366"/> <path d="m240.86 260.32 116.89-87.021c19.801-6.8507 34.711 12.938 23.379 29.873l-118.63 87.887c-11.885 6.5266-23.938 12.667-43.727 0l-115.6-90.918c-10.587-14.716 9.071-35.411 24.245-26.409z" fill="none" stroke="#000" stroke-width="6"/> </g></svg></div>`);
                    $(".del-content-see-more").on("click", function() {
                        $(".data-del-hidden").removeClass("data-del-hidden");
                        $(".del-content-see-more").remove();
                        $(".del-content-wrap").removeClass("del-content-hidden")
                    })
                }
            }                            
        });                    
        $("input[type=radio][name=delOption]").eq(0).prop("checked", true).trigger("change");
        window.addEventListener("resize", function() {
            if ($(document).width()<800) {                            
                // if ($(document).width()<500 && $(document).width()>400) {                                
                //     $(".del-select-wrap select").val($(".del-select-wrap select option:first").val());
                //     $("input[type=radio][name=delOption]").eq(0).prop("checked", true).trigger("change");
                // }
                $(".delivery-wrap").insertAfter(".productView-images");
            } else {                            
                $(".productView-details").eq(1).after($(".delivery-wrap"));
            }
        })
    }    

    /**
     * 
     * @summary Get list of teamdesk Inventory from Part Number
     * 
     * @param {json} data The first data option, will be product sku if not choose option 
     */
    getTeamdeskInventoryList(data) {
        if (data.sku) {
            this.$pCurrent = data;
            fetch(`https://shp-webserver.glitch.me/get-teamdesk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    table: 'Inventory',
                    filter: encodeURIComponent(`Any([Part Number],'${data.sku}')`)
                })
            })
            .then(r=>r.json())
            .then(d=> {
                // console.log(d);                                
                if (d.length>0) {
                    $(".delivery-wrap").show();
                    this.$pSKUList = d;                    
                } else {
                    $(".delivery-wrap").remove();
                    if (data.stock) {
                        this.$pSKUList = [];
                        if (data.stock) {
                            $('[data-product-stock]').text(`Current Stock: ${data.stock}`).show();
                        }
                        // $('[data-product-stock]').text(data.stock);
                        // $('[data-stock-label]').css({"display": "inline-block"});
                    }
                }
                
                this.getTeamdeskPOList(data);
            })
            .catch(e=> {
                console.log(e);
                $(".delivery-wrap").remove();
                if (data.stock) {
                    this.$pSKUList = [];
                    // $('[data-product-stock]').text(data.stock);
                    // $('[data-stock-label]').css({"display": "inline-block"});
                }
            });  
        }
    }

    /**
     * 
     * @summary Get list of teamdesk PO from Part Number
     * 
     * @param {json} data The first data option, will be product sku if not choose option 
     */
    getTeamdeskPOList(data) {
        fetch(`https://shp-webserver.glitch.me/get-teamdesk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                table: 't_763479',
                options: `?filter=Any([Part Number],'${encodeURIComponent(data.sku)}') and [Incoming Quantity]>0 and [Arrival Due Date]>ToDate('1/1/1')&sort=Arrival Due Date//ASC`                        
            })
        })
        .then(r=>r.json())
        .then(d=> {
            // console.log(d);
            if (d.length>0) {
                this.$poSKUList = d;
            }
            if (this.$pSKUList.length>0) {
                // console.log(this.$pSKUList);
                this.setEarliestTime();
            }
        })
        .catch(e=> {
            console.log(e);                
        })
    }

    getTeamdeskInventoryBySKU(data) {        
        if (data.sku) {
            let sku = data.sku;
            if (sku.indexOf("_N")==sku.length-2) {
                sku = sku.slice(0,sku.length-2);                
            }            
            fetch(`//shp-webserver.glitch.me/get-teamdesk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    table: 'Inventory',
                    filter: encodeURIComponent(`Any([SKU],'${sku}')`)
                })
            })
            .then(r=>r.json())
            .then(d=> {                       
                if (d.length>0) {         
                    this.$pSKUList = d;              
                    this.updateDeliverTime(data, d);
                } else if (data.stock) {
                    $('[data-product-stock]').text(`Current Stock: ${data.stock}`).show();
                    // $('[data-stock-label]').css({"display": "inline-block"});
                }
            })
            .catch(e=>{
                console.log(e);
                if (data.stock) {
                    // $('[data-product-stock]').text(data.stock).show();
                    $('[data-product-stock]').text(`Current Stock: ${data.stock}`).show();
                    // $('[data-stock-label]').css({"display": "inline-block"});
                }
            });
        }  else if (data.stock) {
            $('[data-product-stock]').text(`Current Stock: ${data.stock}`).show();
        }
    }

    /**
     * @summary Add delivery note with not-in-stock case
     * 
     * @param {json} item Teamdesk item
     * @param {integer} buff Total added quantity in current cart if there is 
     * @param {integer} qty Current checked quantity
     * @param {Array} noteStock Array of note for Stock information
     * @param {Array} noteShip Array of note for Shipment information
     * 
     * @returns void
     */
    updateDeliverLabelNotInstock(item, buff, qty, noteStock, noteShip) {
        
        /**
         * @summary Calculate the difference of months between 2 date time
         * 
         * @param {Date} d1 First date
         * @param {Date} d2 Second date
         * @returns {integer} Number of months difference. Will be 0 if d1>d2
         */
        function monthDiff(d1, d2) {
            var months;
            months = (d2.getFullYear() - d1.getFullYear()) * 12;
            months -= d1.getMonth();
            months += d2.getMonth();
            return months <= 0 ? 0 : months;
        }        

        if (item["Virtual Quantity"] && qty>0) {
            let vqty = Number(item["Available Quantity"])>0?0:Math.abs(Number(item["Available Quantity"]));
            if (item["Lock Status"]!="Locked for processing" && Number(item["Unlocked for sale quantity"]) > 0 && qty>0) {
                if (Number(item["Unlocked for sale quantity"])-buff > 0) {
                    let tqty = Number(item["Unlocked for sale quantity"])-buff<item["Virtual Quantity"]?Number(item["Unlocked for sale quantity"])-buff:item["Virtual Quantity"];
                    noteStock.push(`In transit: ${tqty}`);
                    // noteShip.push(`Expect to ship out <b>1 week</b> later: <b>${Math.min(Number(item["Unlocked for sale quantity"])-buff, qty)}</b>`);
                    noteShip.transit=Math.min(tqty, qty);
                    vqty+=Math.min(tqty, qty);
                    qty -= Math.min(tqty, qty);
                    buff = 0;
                } else {
                    buff -= Number(item["Unlocked for sale quantity"]);
                    vqty += Number(item["Unlocked for sale quantity"]);
                }
            }                   
            if (Number(item["Quantity Incoming"])-2 > 0 && qty>0) {                             
                if (Number(item["Quantity Incoming"])-2 - buff > 0) {
                    let inItems = this.$poSKUList.filter(po=>po.SKU.toUpperCase() == item["SKU"].toUpperCase())
                    if (inItems.length>0) {
                        let cPO = this.getIncomingTime(qty, inItems, false, buff);
                        // console.log(cPO);
                        if (cPO) {
                            let inItem = inItems[cPO.i];
                            let today = new Date();
                            let date = new Date(inItem["Arrival Due Date"]);                             
                            date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                            let mTime = monthDiff(new Date(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()), date);                        
                            if (mTime == 0) {
                                if (this.$allureException.includes(inItem["Part Number"].toLowerCase()) && item["Classification"].includes("Women")) {                                                                    
                                    // date = new Date();
                                    // date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                                    // date.setMonth(date.getMonth()+3);
                                    mTime+=3;
                                } else {                                                                    
                                    // date = new Date();
                                    // date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                                    // date.setMonth(date.getMonth()+1);
                                    mTime+=1
                                }
                            } else if (this.$allureException.includes(inItem["Part Number"].toLowerCase()) && item["Classification"].includes("Women")) {
                                // date.setMonth(date.getMonth()+2);
                                mTime+=2;
                            }
                            let iqty = cPO.qPO+vqty<item["Virtual Quantity"]?cPO.qPO:Number(item["Virtual Quantity"])-vqty;
                            noteStock.push(`In production: ${iqty}`);
                            // noteShip.push(`Expect to ship out in <b>${date.toLocaleDateString('en-US', options)}</b>: <b>${Math.min(Number(item["Quantity Incoming"])-2-buff,qty)}</b>`);
                            if (noteShip.virtual[mTime]) {
                                noteShip.virtual[mTime]+=Math.min(iqty,qty);
                            } else {
                                noteShip.virtual[mTime]=Math.min(iqty,qty);
                            }
                            vqty+=Math.min(iqty, qty);
                            qty -= Math.min(iqty, qty);
                            buff=0;
                        }  
                    }
                } else {
                    buff = buff - Number(item["Quantity Incoming"]) - 2;
                    vqty += Number(item["Quantity Incoming"])+2;
                }
            }    
            if (qty>0 && vqty<Number(item["Virtual Quantity"])) {
                if (Number(item["Virtual Quantity"])-vqty-buff > 0) {
                    let regex = /[1-9_]+M/g;
                    let t = item["Virtual Location"].match(regex);
                    if (t.length>0) {
                        t = t[0].substring(0,t[0].length-1);
                        if (t.length>0) {
                            if (Number(item["Virtual Quantity"])-buff-vqty >10) {
                                noteStock.push(`Allowed Pre-order: More than 10`);
                            } else {
                                noteStock.push(`Allowed Pre-order: ${Number(item["Virtual Quantity"])-buff-vqty }`);
                            }                        
                            let mTime = 0;
                            if (t.length>1) {
                                // noteShip.push(`Shipping could take up to <b>${t.replace('_','-')} months</b>: <b>${Math.min(Number(item["Virtual Quantity"])-buff, qty)}</b>`);
                                mTime = t.replace('_','-');                            
                            } else {                            
                                // noteShip.push(`Expect to ship out <b>${t} month${t>1?'s':''}</b> later: <b>${Math.min(Number(item["Virtual Quantity"])-buff, qty)}</b>`);     
                                mTime = t;                       
                            }                        
                            if (noteShip.virtual[mTime]) {
                                noteShip.virtual[mTime]+=Math.min(Number(item["Virtual Quantity"])-buff-vqty, qty);
                            } else {
                                noteShip.virtual[mTime]=Math.min(Number(item["Virtual Quantity"])-buff-vqty, qty);
                            }
                            qty = qty - Number(item["Virtual Quantity"])+buff+vqty;
                            // qty = qty - Math.min(Number(item["Virtual Quantity"])-buff-vqty, qty)
                            // buff = 0;
                        }
                    }                    
                }
            }
        }           
        
        // $(".productView-details").find(".form-field.form-field--increments").eq(0).before(`<div class="productView-deliver">${noteShip.join("<br/>")}</div>`)
        // console.log(noteShip);
        let lbShip=[];
        if (noteShip.today) {
            lbShip.push(`Expect to ship out <b>immediately</b>: <b>${noteShip.today}</b>`);
        }
        if (noteShip.transfer) {
            lbShip.push(`Warehouse transfer, expect ship out <b>2-4 days</b> later: <b>${noteShip.transfer}</b>`)
        }
        if (noteShip.pending) {
            lbShip.push(`Expect to ship out <b>1-3 days</b> later: <b>${noteShip.pending}</b>`)
        }
        if (noteShip.transit) {
            lbShip.push(`Expect to ship out <b>1 week</b> later: <b>${noteShip.transit}</b>`);
        }
        // console.log(noteShip);
        if (Object.keys(noteShip.virtual).length > 0) {
            const options = {year: 'numeric', month: 'long'};
            let vkeys = Object.keys(noteShip.virtual).sort(function(a,b) {
                return a-b;
            })                            
            for (let key of vkeys) {
                if (Number(key)) {
                    let date = new Date();
                    date = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
                    date.setMonth(date.getMonth()+Number(key));
                    lbShip.push(`Expect to ship out in <b>${date.toLocaleDateString('en-US', options)}</b>: <b>${noteShip.virtual[key]}</b>`);
                } else {
                    lbShip.push(`Expect to ship out <b>${key} months later</b>: <b>${noteShip.virtual[key]}</b>`);
                }
            }
        }
        // console.log(lbShip);
        if (qty>0) {
            lbShip.push(`Unavailable: ${qty}`);
        }
        if (lbShip.length>0) {
            $(".productView-options1").find("form").eq(0).after(`<div class="productView-deliver">${lbShip.join("<br/>")}</div>`)

            $(".productView-details").find(".form-field.form-field--increments").eq(0).before(`<div class="productView-deliver">${lbShip.join("<br/>")}</div>`)
        }
        if (noteStock.length>0) {
            $('[data-product-stock]').html("Quantity:<br/>"+noteStock.join('<br/>')).show();
            $('[data-stock-label]').css({"display": "none"});
            $(".productView-deliver").after("<span class='productView-tooltip'></span><span class='productView-tooltip-text'>This is an estimate. We are getting shipments weekly so you can receive your order quicker.</span>");
        }
    }

    /**
     * @summary Set Ship out Label in case there is pending/hold items
     * 
     * @param {json} item Teamdesk item value
     * @param {integer} buff Total added quantity in current cart if there is 
     */
    updateDeliverLabelWithPending(item, buff=0) {
        let qty = Number($("[id='qty[]']").val());
        let noteStock = [], noteShip={
            "today":null,
            "transfer":null,
            "pending":null,
            "transit":null,
            "virtual":{}
        };        
        if (Number(item["Available Quantity"]) > 0) {
            if (Number(item["Available Quantity"])-buff > 0) {
                if (Number(item["Available Quantity"])-buff>10) {
                    noteStock.push(`In Stock: More than 10`);
                } else {
                    noteStock.push(`In Stock: ${Number(item["Available Quantity"])-buff }`)
                }
                // noteShip.push(`Expect to ship out <b>1-4 days</b> later: <b>${Math.min(Number(item["Quantity USA"])-buff, qty)}</b>`);                
                noteShip.pending = Math.min(Number(item["Available Quantity"])-buff, qty);
                qty = qty - Math.min(Number(item["Available Quantity"])-buff, qty);
                buff = 0;
            } else {
                buff -= Number(item["Available Quantity"]);
            }
        } else if (Number(item["Available Quantity"]) < 0) {
            buff += Math.abs(Number(item["Available Quantity"]));
        }
                
        this.updateDeliverLabelNotInstock(item, buff, qty, noteStock, noteShip);        
    }

    /**
     * @summary Set Ship out Label when Available Quantity == Total On Hand (there is no pending or holding item)
     * 
     * @param {json} item Teamdesk item value
     * @param {integer} buff Total added quantity in current cart if there is 
     */
    updateDeliverLabel(item, buff=0) {
        let qty = Number($("[id='qty[]']").val());
        let noteStock = [], noteShip={
            "today":null,
            "transfer":null,
            "pending":null,
            "transit":null,
            "virtual":{}
        };        
        if (Number(item["Quantity USA"]) > 0) {
            if (Number(item["Quantity USA"])-buff>0) {
                if (Number(item["Quantity USA"])-buff>10) {
                    noteStock.push(`US Warehouse: More than 10`);
                } else {
                    noteStock.push(`US Warehouse: ${Number(item["Quantity USA"])-buff }`)
                }
                // noteShip.push(`Expect to ship out <b>immediately</b>: <b>${Math.min(Number(item["Quantity USA"])-buff, qty)}</b>`);     
                noteShip.today=Math.min(Number(item["Quantity USA"])-buff, qty);           
                qty = qty - Math.min(Number(item["Quantity USA"])-buff, qty);
                buff = 0;
            } else {
                buff -= Number(item["Quantity USA"]);
            }
        }
        if (Number(item["Quantity Canada"]) > 0 && qty>0) {
            if (Number(item["Quantity Canada"])-buff > 0) {            
                if (Number(item["Quantity Canada"])-buff>10) {
                    noteStock.push(`Canada Warehouse: More than 10`);
                } else {
                    noteStock.push(`Canada Warehouse: ${Number(item["Quantity Canada"])-buff }`)
                }
                // noteShip.push(`Warehouse transfer, expect ship out <b>2-4 days</b> later: <b>${Math.min(Number(item["Quantity USA"]) + Number(item["Quantity Canada"])-buff, qty)}</b>`);
                noteShip.transfer = Math.min(Number(item["Quantity Canada"])-buff, qty);
                qty = qty - Math.min(Number(item["Quantity Canada"])-buff, qty);
                buff = 0;
            } else {
                buff -= Number(item["Quantity Canada"]);
            }
        }
                
        this.updateDeliverLabelNotInstock(item, buff, qty, noteStock, noteShip);        
    }

    updateDeliverTime(data, sList=null) {            
        $(".productView-deliver").remove();
        $(".productView-tooltip").remove();
        $(".productView-tooltip-text").remove();
        let arrCheck = sList?sList:this.$pSKUList;
        if (arrCheck.length>0 && data.sku) {   
            // console.log(data);         
            this.$pCurrent = data;
            let sku = data.sku;
            if (sku.indexOf("_N")==sku.length-2) {
                sku = sku.slice(0,sku.length-2);                
            }
            let item = arrCheck.find(p=>p.SKU.toUpperCase()==sku.toUpperCase());
            if (item) {                
                if (this.$cart) {
                    if (this.$cart.length>0) {
                        let totalbuff = 0;
                        try {
                            let titem = this.$cart[0].lineItems.physicalItems.filter(p=>p.sku.toUpperCase()==data.sku.toUpperCase())                            
                            if (titem.length>0) {
                                totalbuff = titem.reduce((a,b)=>a+b.quantity,0);                                
                            }
                            
                        } catch (error) {
                            console.log(error);                            
                        } finally {                            
                            if (Number(item["Total On Hand"])!=Number(item["Available Quantity"])) {
                                this.updateDeliverLabelWithPending(item, totalbuff);
                            } else {
                                this.updateDeliverLabel(item, totalbuff);
                            }
                        }
                    } else {
                        if (Number(item["Total On Hand"])!=Number(item["Available Quantity"])) {
                            this.updateDeliverLabelWithPending(item);
                        } else {
                            this.updateDeliverLabel(item);
                        }
                    } 
                } else {
                    if (Number(item["Total On Hand"])!=Number(item["Available Quantity"])) {
                        this.updateDeliverLabelWithPending(item);
                    } else {
                        this.updateDeliverLabel(item);
                    }
                }
            } else if (sList==null) {                
                this.getTeamdeskInventoryBySKU(data);
            }
        } else if (sList==null) {            
            this.getTeamdeskInventoryBySKU(data);
        }
    }

    initProductAttributes(data) {        
        const behavior = data.out_of_stock_behavior;
        const inStockIds = data.in_stock_attributes;
        const outOfStockMessage = ` (${data.out_of_stock_message})`;

        this.showProductImage(data.image);

        if (behavior !== 'hide_option' && behavior !== 'label_option') {
            return;
        }

        $('[data-product-attribute-value]', this.$scope).each((i, attribute) => {
            const $attribute = $(attribute);
            const attrId = parseInt($attribute.data('product-attribute-value'), 10);


            if (inStockIds.indexOf(attrId) !== -1) {
                this.enableAttribute($attribute, behavior, outOfStockMessage);
            } else {
                if (!this.$hasSoldOut) {
                    this.$hasSoldOut = true;
                }
                this.disableAttribute($attribute, behavior, outOfStockMessage);
            }
        });
    }

    /**
     * Hide or mark as unavailable out of stock attributes if enabled
     * @param  {Object} data Product attribute data
     */
    updateProductAttributes(data) {
        const behavior = data.out_of_stock_behavior;
        const inStockIds = data.in_stock_attributes;
        const outOfStockMessage = ` (${data.out_of_stock_message})`;

        this.showProductImage(data.image);

        if (behavior !== 'hide_option' && behavior !== 'label_option') {
            return;
        }

        $('[data-product-attribute-value]', this.$scope).each((i, attribute) => {
            const $attribute = $(attribute);
            const attrId = parseInt($attribute.data('product-attribute-value'), 10);


            if (inStockIds.indexOf(attrId) !== -1) {
                this.enableAttribute($attribute, behavior, outOfStockMessage);
            } else {
                this.disableAttribute($attribute, behavior, outOfStockMessage);
            }
        });
    }

    disableAttribute($attribute, behavior, outOfStockMessage) {
        if (this.getAttributeType($attribute) === 'set-select') {
            return this.disableSelectOptionAttribute($attribute, behavior, outOfStockMessage);
        }

        if (behavior === 'hide_option') {
            $attribute.hide();
        } else {
            $attribute.addClass('unavailable');
        }
    }

    disableSelectOptionAttribute($attribute, behavior, outOfStockMessage) {
        const $select = $attribute.parent();

        if (behavior === 'hide_option') {
            $attribute.toggleOption(false);
            // If the attribute is the selected option in a select dropdown, select the first option (MERC-639)
            if ($attribute.parent().val() === $attribute.attr('value')) {
                $select[0].selectedIndex = 0;
            }
        } else {
            $attribute.attr('disabled', 'disabled');
            $attribute.html($attribute.html().replace(outOfStockMessage, '') + outOfStockMessage);
        }
    }

    enableAttribute($attribute, behavior, outOfStockMessage) {
        if (this.getAttributeType($attribute) === 'set-select') {
            return this.enableSelectOptionAttribute($attribute, behavior, outOfStockMessage);
        }

        if (behavior === 'hide_option') {
            $attribute.show();
        } else {
            $attribute.removeClass('unavailable');
        }
    }

    enableSelectOptionAttribute($attribute, behavior, outOfStockMessage) {
        if (behavior === 'hide_option') {
            $attribute.toggleOption(true);
        } else {
            $attribute.removeAttr('disabled');
            $attribute.html($attribute.html().replace(outOfStockMessage, ''));
        }
    }

    getAttributeType($attribute) {
        const $parent = $attribute.closest('[data-product-attribute]');

        return $parent ? $parent.data('product-attribute') : null;
    }

    /**
     * Allow radio buttons to get deselected
     */
    initRadioAttributes() {
        $('[data-product-attribute] input[type="radio"]', this.$scope).each((i, radio) => {
            const $radio = $(radio);

            // Only bind to click once
            if ($radio.attr('data-state') !== undefined) {
                $radio.click(() => {
                    if ($radio.data('state') === true) {
                        $radio.prop('checked', false);
                        $radio.data('state', false);

                        $radio.change();
                    } else {
                        $radio.data('state', true);
                    }

                    this.initRadioAttributes();
                });
            }

            $radio.attr('data-state', $radio.prop('checked'));
        });
    }
}
